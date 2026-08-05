//! Xray-core sidecar process management.

mod config;

pub use config::write_xray_config;

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use aurestream_config::ProxyNode;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, BufReader};
use tokio::net::TcpStream;
use tokio::process::{Child, Command};
use tokio::time::{sleep, timeout, Instant};

use crate::state::{EngineState, StateMachine};
use crate::{Engine, EngineError};

const STARTUP_TIMEOUT: Duration = Duration::from_secs(10);
const PROBE_CONNECT_TIMEOUT: Duration = Duration::from_millis(100);
const POLL_INTERVAL: Duration = Duration::from_millis(100);
const SIDECAR_NAME: &str = "aurestream-core";
const GEOIP_FILE: &str = "geoip.dat";
const GEOSITE_FILE: &str = "geosite.dat";
/// Sidecar log file stem prefix — matches shell `logging::CORE_LOG_PREFIX`.
const CORE_LOG_PREFIX: &str = "aurestream-core";

struct Runtime {
    sm: StateMachine,
    child: Option<Child>,
    socks_port: Option<u16>,
    api_port: Option<u16>,
}

/// MVP Xray engine: dialect `build_config` + sidecar spawn/stop.
pub struct XrayEngine {
    inner: Mutex<Runtime>,
    sidecar_override: Option<PathBuf>,
    asset_override: Option<PathBuf>,
    /// Directory for `aurestream-core-YYYY-MM-DD.log` (OS app log dir).
    log_dir: Option<PathBuf>,
}

impl XrayEngine {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(Runtime {
                sm: StateMachine::new(),
                child: None,
                socks_port: None,
                api_port: None,
            }),
            sidecar_override: None,
            asset_override: None,
            log_dir: None,
        }
    }

    /// Prefer an explicit binary path (tests / custom installs).
    pub fn with_sidecar_path(path: impl Into<PathBuf>) -> Self {
        let mut eng = Self::new();
        eng.sidecar_override = Some(path.into());
        eng
    }

    /// Prefer an explicit asset directory containing `geoip.dat` / `geosite.dat`.
    pub fn with_asset_dir(mut self, path: impl Into<PathBuf>) -> Self {
        self.asset_override = Some(path.into());
        self
    }

    /// Write sidecar stdout/stderr into `{log_dir}/aurestream-core-YYYY-MM-DD.log`.
    pub fn with_log_dir(mut self, path: impl Into<PathBuf>) -> Self {
        self.log_dir = Some(path.into());
        self
    }

    fn resolve_sidecar(&self) -> Result<PathBuf, EngineError> {
        if let Some(p) = &self.sidecar_override {
            if p.is_file() {
                return Ok(p.clone());
            }
            return Err(EngineError::io(format!(
                "sidecar override not found: {}",
                p.display()
            )));
        }
        resolve_sidecar_path()
    }

    fn resolve_assets(&self, sidecar: &Path) -> Option<PathBuf> {
        if let Some(p) = &self.asset_override {
            if dir_has_geo_assets(p) {
                return Some(p.clone());
            }
        }
        resolve_asset_dir(sidecar)
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Runtime> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }
}

impl Default for XrayEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl Engine for XrayEngine {
    fn build_config(
        &self,
        path: &Path,
        node: &ProxyNode,
        socks_port: u16,
        api_port: u16,
    ) -> Result<(), EngineError> {
        write_xray_config(path, node, socks_port, api_port)?;
        let mut guard = self.lock();
        guard.socks_port = Some(socks_port);
        guard.api_port = Some(api_port);
        Ok(())
    }

    async fn start(&self, config: &Path) -> Result<(), EngineError> {
        let sidecar = self.resolve_sidecar()?;
        let asset_dir = self.resolve_assets(&sidecar);
        let core_log = self.log_dir.as_ref().map(|d| prepare_core_log_path(d));
        let config_str = config
            .to_str()
            .ok_or_else(|| EngineError::io("config path is not valid UTF-8"))?
            .to_string();

        let (socks_port, api_port) = {
            let mut guard = self.lock();
            guard.sm.transition(EngineState::Starting)?;
            let socks = guard.socks_port.unwrap_or(10808);
            let api = guard.api_port.unwrap_or(10809);
            let (socks, api) = parse_ports_from_config(config).unwrap_or((socks, api));
            guard.socks_port = Some(socks);
            guard.api_port = Some(api);
            (socks, api)
        };

        log::info!(
            "start sidecar={} config={} socks={} api={} core_log={}",
            sidecar.display(),
            config.display(),
            socks_port,
            api_port,
            core_log
                .as_ref()
                .map(|p| p.display().to_string())
                .unwrap_or_else(|| "<none>".into())
        );

        let mut cmd = Command::new(&sidecar);
        cmd.args(["run", "-c", &config_str])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);

        // Xray resolves geoip.dat / geosite.dat via XRAY_LOCATION_ASSET (else cwd).
        if let Some(ref assets) = asset_dir {
            cmd.env("XRAY_LOCATION_ASSET", assets);
            // cwd fallback for older builds / relative asset lookups.
            cmd.current_dir(assets);
        } else if let Some(parent) = sidecar.parent() {
            cmd.current_dir(parent);
        }

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                let reason = format!("spawn sidecar {}: {e}", sidecar.display());
                log::error!("{reason}");
                let mut guard = self.lock();
                let _ = guard.sm.transition(EngineState::Failed {
                    reason: reason.clone(),
                });
                return Err(EngineError::io(reason));
            }
        };

        let ready = wait_until_ready(socks_port, api_port, &mut child).await;

        if !ready {
            let detail = collect_child_failure(&mut child, core_log.as_deref()).await;
            let asset_hint = match &asset_dir {
                Some(p) => format!("assets={}", p.display()),
                None => "assets=<not found>".into(),
            };
            let reason = if detail.is_empty() {
                format!(
                    "startup timeout: socks :{socks_port} / api :{api_port} not ready ({asset_hint}; sidecar={})",
                    sidecar.display()
                )
            } else {
                format!("sidecar failed: {detail}")
            };
            log::error!("{reason}");
            let mut guard = self.lock();
            let _ = guard.sm.transition(EngineState::Failed {
                reason: reason.clone(),
            });
            return Err(EngineError::not_ready(reason));
        }

        // Keep draining stdout/stderr into the core log (or discard) so pipes never block.
        attach_sidecar_log_pumps(&mut child, core_log);

        let mut guard = self.lock();
        guard.child = Some(child);
        guard.sm.transition(EngineState::Running)?;
        log::info!("sidecar running socks=:{socks_port} api=:{api_port}");
        Ok(())
    }

    async fn stop(&self) -> Result<(), EngineError> {
        let mut child = {
            let mut guard = self.lock();
            match guard.sm.state() {
                EngineState::Idle => return Ok(()),
                EngineState::Failed { .. } => {
                    let child = guard.child.take();
                    let _ = guard.sm.transition(EngineState::Idle);
                    child
                }
                EngineState::Starting => {
                    guard.sm.force(EngineState::Stopping);
                    guard.child.take()
                }
                _ => {
                    guard.sm.transition(EngineState::Stopping)?;
                    guard.child.take()
                }
            }
        };

        if let Some(ref mut c) = child {
            log::info!("stopping sidecar");
            let _ = c.kill().await;
            let _ = c.wait().await;
        }

        let mut guard = self.lock();
        if matches!(guard.sm.state(), EngineState::Stopping) {
            guard.sm.transition(EngineState::Idle)?;
            log::info!("sidecar stopped");
        }
        Ok(())
    }

    fn state(&self) -> EngineState {
        self.lock().sm.state()
    }
}

async fn wait_until_ready(socks_port: u16, api_port: u16, child: &mut Child) -> bool {
    let started = Instant::now();
    let deadline = started + STARTUP_TIMEOUT;
    loop {
        if let Ok(Some(_status)) = child.try_wait() {
            return false;
        }
        if probe_port(socks_port).await || probe_port(api_port).await {
            return true;
        }
        if Instant::now() >= deadline {
            return false;
        }
        sleep(POLL_INTERVAL).await;
    }
}

async fn probe_port(port: u16) -> bool {
    let addr = format!("127.0.0.1:{port}");
    matches!(
        timeout(PROBE_CONNECT_TIMEOUT, TcpStream::connect(addr)).await,
        Ok(Ok(_))
    )
}

/// Kill the child (if still alive) and return a short stderr/stdout snippet.
async fn collect_child_failure(child: &mut Child, core_log: Option<&Path>) -> String {
    let mut stderr_buf = Vec::new();
    let mut stdout_buf = Vec::new();

    if let Some(mut err) = child.stderr.take() {
        let _ = timeout(Duration::from_millis(400), err.read_to_end(&mut stderr_buf)).await;
    }
    if let Some(mut out) = child.stdout.take() {
        let _ = timeout(Duration::from_millis(200), out.read_to_end(&mut stdout_buf)).await;
    }

    let _ = child.kill().await;
    let status = child.wait().await.ok();

    let err = String::from_utf8_lossy(&stderr_buf);
    let out = String::from_utf8_lossy(&stdout_buf);
    if let Some(path) = core_log {
        for line in err.lines() {
            write_core_line(path, "stderr", line);
        }
        for line in out.lines() {
            write_core_line(path, "stdout", line);
        }
    }

    let mut parts = Vec::new();
    if let Some(st) = status {
        if !st.success() {
            parts.push(format!("exit={st}"));
        }
    }
    let combined = format!("{err}\n{out}");
    let snip = last_useful_line(&combined);
    if !snip.is_empty() {
        parts.push(snip);
    }
    parts.join(" — ")
}

/// `{log_dir}/aurestream-core-YYYY-MM-DD.log` (local calendar day).
fn prepare_core_log_path(log_dir: &Path) -> PathBuf {
    let _ = fs::create_dir_all(log_dir);
    let date = chrono::Local::now().format("%Y-%m-%d");
    let path = log_dir.join(format!("{CORE_LOG_PREFIX}-{date}.log"));
    let _ = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path);
    path
}

fn format_timestamp_local() -> String {
    let now = chrono::Local::now();
    format!(
        "{}.{:03}",
        now.format("%Y-%m-%d %H:%M:%S"),
        now.timestamp_subsec_millis()
    )
}

/// Unified core log line: `YYYY-MM-DD HH:MM:SS.mmm CORE [stdout|stderr] …`
fn write_core_line(path: &Path, stream: &str, line: &str) {
    let trimmed = line.trim_end_matches(['\r', '\n']);
    if trimmed.is_empty() {
        return;
    }
    let row = format!(
        "{} CORE [{}] {}\n",
        format_timestamp_local(),
        stream,
        trimmed
    );
    if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = f.write_all(row.as_bytes());
    }
}

fn attach_sidecar_log_pumps(child: &mut Child, core_log: Option<PathBuf>) {
    if let Some(stdout) = child.stdout.take() {
        let path = core_log.clone();
        tokio::spawn(async move {
            pump_pipe_to_core_log(stdout, "stdout", path).await;
        });
    }
    if let Some(stderr) = child.stderr.take() {
        let path = core_log;
        tokio::spawn(async move {
            pump_pipe_to_core_log(stderr, "stderr", path).await;
        });
    }
}

async fn pump_pipe_to_core_log<R>(reader: R, stream: &'static str, core_log: Option<PathBuf>)
where
    R: tokio::io::AsyncRead + Unpin,
{
    let mut lines = BufReader::new(reader).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        if let Some(ref path) = core_log {
            write_core_line(path, stream, &line);
        }
        // Mirror important core noise into the app logger at debug.
        log::debug!("core/{stream}: {line}");
    }
}

fn last_useful_line(text: &str) -> String {
    text.lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .rev()
        .find(|l| {
            // Prefer the actual failure line over the banner.
            !l.starts_with("Xray ")
                && !l.contains("Penetrates Everything")
                && !l.contains("anti-censorship")
                && !l.contains("Reading config:")
        })
        .or_else(|| {
            text.lines()
                .map(str::trim)
                .filter(|l| !l.is_empty())
                .last()
        })
        .unwrap_or("")
        .chars()
        .take(400)
        .collect()
}

fn parse_ports_from_config(path: &Path) -> Option<(u16, u16)> {
    let text = std::fs::read_to_string(path).ok()?;
    let v: serde_json::Value = serde_json::from_str(&text).ok()?;
    let inbounds = v.get("inbounds")?.as_array()?;
    let mut socks = None;
    let mut api = None;
    for ib in inbounds {
        let proto = ib.get("protocol").and_then(|p| p.as_str()).unwrap_or("");
        let tag = ib.get("tag").and_then(|t| t.as_str()).unwrap_or("");
        let port = ib.get("port").and_then(|p| p.as_u64()).map(|p| p as u16);
        if matches!(proto, "socks" | "mixed") {
            socks = port.or(socks);
        }
        if tag == "api" {
            api = port.or(api);
        }
    }
    Some((socks.unwrap_or(10808), api.unwrap_or(10809)))
}

/// Resolve `aurestream-core` like legacy `get_sidecar_path`:
/// env override → next to current exe → `src-tauri/binaries/` with target triple → PATH.
pub fn resolve_sidecar_path() -> Result<PathBuf, EngineError> {
    if let Ok(p) = std::env::var("AURESTREAM_CORE_PATH") {
        let path = PathBuf::from(p);
        if path.is_file() {
            return Ok(path);
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            if let Some(found) = resolve_sidecar_in_dir(dir) {
                return Ok(found);
            }
        }
    }

    let candidates = [
        PathBuf::from("src-tauri/binaries"),
        PathBuf::from("../src-tauri/binaries"),
        PathBuf::from("../../src-tauri/binaries"),
    ];
    for dir in candidates {
        if let Some(found) = resolve_sidecar_in_dir(&dir) {
            return Ok(found);
        }
    }

    Ok(PathBuf::from(SIDECAR_NAME))
}

fn resolve_sidecar_in_dir(exe_dir: &Path) -> Option<PathBuf> {
    #[cfg(windows)]
    let plain = exe_dir.join(SIDECAR_NAME).with_extension("exe");
    #[cfg(not(windows))]
    let plain = exe_dir.join(SIDECAR_NAME);

    if plain.is_file() {
        return Some(plain);
    }

    let prefix = format!("{SIDECAR_NAME}-");
    #[cfg(windows)]
    let suffix = ".exe";
    #[cfg(not(windows))]
    let suffix = "";

    let entries = std::fs::read_dir(exe_dir).ok()?;
    for entry in entries.flatten() {
        let name = entry.file_name();
        let Some(name) = name.to_str() else {
            continue;
        };
        if name.starts_with(&prefix) && name.ends_with(suffix) && entry.path().is_file() {
            return Some(entry.path());
        }
    }
    None
}

fn dir_has_geo_assets(dir: &Path) -> bool {
    dir.join(GEOIP_FILE).is_file() || dir.join(GEOSITE_FILE).is_file()
}

/// Find the directory that holds Xray geo assets (`geoip.dat` / `geosite.dat`).
///
/// Search order:
/// 1. `AURESTREAM_ASSET_DIR` / `XRAY_LOCATION_ASSET`
/// 2. Next to the sidecar binary
/// 3. `resources/` next to the sidecar / current exe (Tauri bundle + `tauri dev`)
/// 4. Dev-tree `src-tauri/resources`
pub fn resolve_asset_dir(sidecar: &Path) -> Option<PathBuf> {
    for key in ["AURESTREAM_ASSET_DIR", "XRAY_LOCATION_ASSET"] {
        if let Ok(p) = std::env::var(key) {
            let path = PathBuf::from(p);
            if dir_has_geo_assets(&path) {
                return Some(path);
            }
        }
    }

    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Some(parent) = sidecar.parent() {
        candidates.push(parent.to_path_buf());
        candidates.push(parent.join("resources"));
        // Bundle layout sometimes nests as `…/Resources/resources/`.
        candidates.push(parent.join("resources").join("resources"));
        if let Some(grand) = parent.parent() {
            candidates.push(grand.join("resources"));
            candidates.push(grand.join("resources").join("resources"));
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.to_path_buf());
            candidates.push(dir.join("resources"));
            candidates.push(dir.join("resources").join("resources"));
        }
    }

    candidates.extend([
        PathBuf::from("src-tauri/resources"),
        PathBuf::from("../src-tauri/resources"),
        PathBuf::from("../../src-tauri/resources"),
        PathBuf::from("resources"),
    ]);

    for dir in candidates {
        if dir_has_geo_assets(&dir) {
            return Some(dir);
        }
    }
    None
}

/// Shared handle type for AppState (Task 9).
pub type SharedXrayEngine = Arc<XrayEngine>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dir_has_geo_assets_false_for_empty() {
        let dir = tempfile::tempdir().unwrap();
        assert!(!dir_has_geo_assets(dir.path()));
    }

    #[test]
    fn resolve_asset_dir_finds_geoip_next_to_sidecar() {
        let dir = tempfile::tempdir().unwrap();
        let sidecar = dir.path().join("aurestream-core");
        std::fs::write(&sidecar, b"x").unwrap();
        std::fs::write(dir.path().join(GEOIP_FILE), b"geo").unwrap();
        let found = resolve_asset_dir(&sidecar).expect("asset dir");
        assert_eq!(found, dir.path());
    }

    #[test]
    fn last_useful_line_skips_banner() {
        let text = "\
Xray 26.3.27 (Xray, Penetrates Everything.) abc
A unified platform for anti-censorship.
Failed to start: main: failed to load config files: geoip.dat
";
        let line = last_useful_line(text);
        assert!(line.contains("Failed to start"), "{line}");
    }
}
