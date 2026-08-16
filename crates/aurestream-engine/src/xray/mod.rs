//! Xray-core sidecar process management.

mod config;

pub use config::{write_xray_config_with_options, BuildOptions};

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, Mutex, Weak};
use std::time::Duration;

use aurestream_config::ProxyNode;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, BufReader};
use tokio::net::TcpStream;
use tokio::process::{Child, Command};
use tokio::sync::{broadcast, oneshot};
use tokio::task::JoinHandle;
use tokio::time::{sleep, timeout, Instant};

use crate::state::{EngineState, StateMachine};
use crate::{Engine, EngineError, EngineExitEvent, KernelId, KernelLaunchSpec, TrafficStats};

const STARTUP_TIMEOUT: Duration = Duration::from_secs(10);
const PROBE_CONNECT_TIMEOUT: Duration = Duration::from_millis(100);
const POLL_INTERVAL: Duration = Duration::from_millis(100);
const STATS_QUERY_TIMEOUT: Duration = Duration::from_secs(5);
const SIDECAR_NAME: &str = "aurestream-core";
const CONFIG_FILENAME: &str = "xray-config.json";
const GEOIP_FILE: &str = "geoip.dat";
const GEOSITE_FILE: &str = "geosite.dat";
/// Linux deb/rpm install resources under `{prefix}/lib/{productName}/resources`.
const LINUX_PRODUCT_DIR: &str = "AureStream";
/// Sidecar log file stem prefix — matches shell `logging::CORE_LOG_PREFIX`.
const CORE_LOG_PREFIX: &str = "aurestream-core";

struct Runtime {
    sm: StateMachine,
    monitor: Option<ProcessMonitor>,
    socks_port: Option<u16>,
    api_port: Option<u16>,
    generation: u64,
    last_exit: Option<EngineExitEvent>,
}

struct ProcessMonitor {
    stop_tx: oneshot::Sender<()>,
    join: JoinHandle<()>,
}

/// MVP Xray engine: dialect `build_config` + sidecar spawn/stop.
pub struct XrayEngine {
    inner: Arc<Mutex<Runtime>>,
    exit_tx: broadcast::Sender<EngineExitEvent>,
    sidecar_override: Option<PathBuf>,
    asset_override: Option<PathBuf>,
    /// Directory for `aurestream-core-YYYY-MM-DD.log` (OS app log dir).
    log_dir: Option<PathBuf>,
}

impl XrayEngine {
    pub fn new() -> Self {
        let (exit_tx, _) = broadcast::channel(16);
        Self {
            inner: Arc::new(Mutex::new(Runtime {
                sm: StateMachine::new(),
                monitor: None,
                socks_port: None,
                api_port: None,
                generation: 0,
                last_exit: None,
            })),
            exit_tx,
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

    /// Subscribe to unexpected exits of engine-owned sidecar processes.
    ///
    /// Elevated TUN helpers own their core process and must report their own exits.
    pub fn subscribe_exit_events(&self) -> broadcast::Receiver<EngineExitEvent> {
        self.exit_tx.subscribe()
    }

    /// Return the latest unexpected sidecar exit, if one has occurred.
    pub fn last_exit_event(&self) -> Option<EngineExitEvent> {
        self.lock().last_exit.clone()
    }
}

impl Default for XrayEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl XrayEngine {
    /// Transition Starting without spawning (elevated helper owns the process).
    pub fn begin_external_start(&self, socks_port: u16, api_port: u16) -> Result<(), EngineError> {
        let mut guard = self.lock();
        guard.sm.transition(EngineState::Starting)?;
        guard.generation = guard.generation.wrapping_add(1);
        guard.socks_port = Some(socks_port);
        guard.api_port = Some(api_port);
        // A monitor can only remain here after its process already exited.
        guard.monitor.take();
        Ok(())
    }

    /// Mark Running after external (elevated) core is ready.
    pub fn finish_external_start(&self) -> Result<(), EngineError> {
        let mut guard = self.lock();
        guard.sm.transition(EngineState::Running)?;
        Ok(())
    }

    /// Mark Failed without process ownership (helper start failed).
    pub fn fail_external_start(&self, reason: impl Into<String>) -> Result<(), EngineError> {
        let mut guard = self.lock();
        let reason = reason.into();
        let _ = guard.sm.transition(EngineState::Failed {
            reason: reason.clone(),
        });
        Ok(())
    }

    /// Transition Stopping → Idle when helper killed the process.
    pub fn finish_external_stop(&self) -> Result<(), EngineError> {
        let mut guard = self.lock();
        if !matches!(
            guard.sm.state(),
            EngineState::Idle | EngineState::Failed { .. }
        ) {
            let _ = guard.sm.transition(EngineState::Stopping);
        }
        guard.monitor.take();
        let _ = guard.sm.transition(EngineState::Idle);
        Ok(())
    }
}

#[async_trait::async_trait]
impl Engine for XrayEngine {
    fn config_filename(&self) -> &'static str {
        CONFIG_FILENAME
    }

    fn launch_spec(&self) -> Result<KernelLaunchSpec, EngineError> {
        let executable = self.resolve_sidecar()?;
        let asset_dir = self.resolve_assets(&executable);
        Ok(KernelLaunchSpec {
            id: KernelId::XRAY,
            config_filename: self.config_filename(),
            executable,
            asset_dir,
        })
    }

    fn build_config_with_options(
        &self,
        path: &Path,
        node: &ProxyNode,
        opts: BuildOptions,
    ) -> Result<(), EngineError> {
        write_xray_config_with_options(path, node, opts)?;
        let mut guard = self.lock();
        guard.socks_port = Some(opts.socks_port);
        guard.api_port = Some(opts.api_port);
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

        let (socks_port, api_port, generation) = {
            let mut guard = self.lock();
            guard.sm.transition(EngineState::Starting)?;
            guard.generation = guard.generation.wrapping_add(1);
            let generation = guard.generation;
            guard.monitor.take();
            let socks = guard.socks_port.unwrap_or(10808);
            let api = guard.api_port.unwrap_or(10809);
            let (socks, api) = parse_ports_from_config(config).unwrap_or((socks, api));
            guard.socks_port = Some(socks);
            guard.api_port = Some(api);
            (socks, api, generation)
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

        // Xray is a console-subsystem binary. Without CREATE_NO_WINDOW, every
        // start flashes a black terminal on the user's desktop (and rapid
        // reconnect/restart looks like terminals "spamming").
        #[cfg(windows)]
        {
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

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
        if guard.generation != generation {
            let _ = child.start_kill();
            return Err(EngineError::illegal_transition("stale-start", "running"));
        }
        if let Err(error) = guard.sm.transition(EngineState::Running) {
            let _ = child.start_kill();
            return Err(error);
        }
        guard.monitor = Some(spawn_process_monitor(
            Arc::clone(&self.inner),
            self.exit_tx.clone(),
            child,
            generation,
        ));
        log::info!("sidecar running socks=:{socks_port} api=:{api_port}");
        Ok(())
    }

    async fn stop(&self) -> Result<(), EngineError> {
        let monitor = {
            let mut guard = self.lock();
            match guard.sm.state() {
                EngineState::Idle => return Ok(()),
                EngineState::Failed { .. } => {
                    let monitor = guard.monitor.take();
                    let _ = guard.sm.transition(EngineState::Idle);
                    monitor
                }
                EngineState::Starting => {
                    guard.sm.force(EngineState::Stopping);
                    guard.monitor.take()
                }
                _ => {
                    guard.sm.transition(EngineState::Stopping)?;
                    guard.monitor.take()
                }
            }
        };

        if let Some(monitor) = monitor {
            log::info!("stopping sidecar");
            let _ = monitor.stop_tx.send(());
            if let Err(error) = monitor.join.await {
                log::warn!("sidecar monitor join failed: {error}");
            }
        }

        let mut guard = self.lock();
        if matches!(guard.sm.state(), EngineState::Stopping) {
            guard.sm.transition(EngineState::Idle)?;
            log::info!("sidecar stopped");
        }
        Ok(())
    }

    async fn query_outbound_traffic(
        &self,
        outbound_tag: &str,
    ) -> Result<TrafficStats, EngineError> {
        if outbound_tag.is_empty() {
            return Err(EngineError::config("outbound tag is empty"));
        }

        let sidecar = self.resolve_sidecar()?;
        let api_port = {
            let guard = self.lock();
            if !matches!(guard.sm.state(), EngineState::Running) {
                return Err(EngineError::not_ready("engine is not running"));
            }
            guard.api_port.unwrap_or(10809)
        };
        let server = format!("127.0.0.1:{api_port}");
        let pattern = format!("outbound>>>{outbound_tag}>>>traffic>>>");

        let mut command = Command::new(&sidecar);
        command
            .args([
                "api",
                "statsquery",
                &format!("--server={server}"),
                "-timeout=3",
                "-pattern",
                &pattern,
            ])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);

        #[cfg(windows)]
        {
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            command.creation_flags(CREATE_NO_WINDOW);
        }

        let output = timeout(STATS_QUERY_TIMEOUT, command.output())
            .await
            .map_err(|_| EngineError::not_ready("Xray stats query timed out"))?
            .map_err(|e| EngineError::io(format!("run Xray stats query: {e}")))?;

        if !output.status.success() {
            let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(EngineError::not_ready(if detail.is_empty() {
                format!("Xray stats query exited with {}", output.status)
            } else {
                format!("Xray stats query failed: {detail}")
            }));
        }

        let stdout = String::from_utf8(output.stdout)
            .map_err(|_| EngineError::io("Xray stats output is not UTF-8"))?;
        parse_outbound_traffic(&stdout, outbound_tag)
    }

    fn state(&self) -> EngineState {
        self.lock().sm.state()
    }

    fn subscribe_exit_events(&self) -> broadcast::Receiver<EngineExitEvent> {
        XrayEngine::subscribe_exit_events(self)
    }

    fn begin_external_start(&self, socks_port: u16, api_port: u16) -> Result<(), EngineError> {
        XrayEngine::begin_external_start(self, socks_port, api_port)
    }

    fn finish_external_start(&self) -> Result<(), EngineError> {
        XrayEngine::finish_external_start(self)
    }

    fn fail_external_start(&self, reason: String) -> Result<(), EngineError> {
        XrayEngine::fail_external_start(self, reason)
    }

    fn finish_external_stop(&self) -> Result<(), EngineError> {
        XrayEngine::finish_external_stop(self)
    }
}

fn parse_outbound_traffic(output: &str, outbound_tag: &str) -> Result<TrafficStats, EngineError> {
    let upload_name = format!("outbound>>>{outbound_tag}>>>traffic>>>uplink");
    let download_name = format!("outbound>>>{outbound_tag}>>>traffic>>>downlink");

    let trimmed = output.trim();
    if trimmed.starts_with('{') {
        let root: serde_json::Value = serde_json::from_str(trimmed)
            .map_err(|e| EngineError::io(format!("invalid Xray stats JSON: {e}")))?;
        let Some(entries) = root.get("stat") else {
            return Ok(TrafficStats::default());
        };
        let entries = entries
            .as_array()
            .ok_or_else(|| EngineError::io("invalid Xray stats JSON: `stat` is not an array"))?;
        let mut stats = TrafficStats::default();

        for entry in entries {
            let Some(name) = entry.get("name").and_then(serde_json::Value::as_str) else {
                continue;
            };
            if name != upload_name && name != download_name {
                continue;
            }

            // Proto JSON omits scalar fields whose value is zero.
            let value = match entry.get("value") {
                None | Some(serde_json::Value::Null) => 0,
                Some(value) => value
                    .as_u64()
                    .or_else(|| value.as_str().and_then(|raw| raw.parse().ok()))
                    .ok_or_else(|| {
                        EngineError::io(format!("invalid Xray stats value for {name}"))
                    })?,
            };
            if name == upload_name {
                stats.upload = value;
            } else {
                stats.download = value;
            }
        }

        return Ok(stats);
    }

    let mut current_name: Option<String> = None;
    let mut stats = TrafficStats::default();

    for line in output.lines() {
        let line = line.trim();
        if let Some(raw) = line.strip_prefix("name:") {
            let raw = raw.trim();
            current_name = serde_json::from_str::<String>(raw)
                .ok()
                .or_else(|| Some(raw.trim_matches('"').to_string()));
            continue;
        }

        let Some(raw_value) = line.strip_prefix("value:") else {
            continue;
        };
        let Some(name) = current_name.take() else {
            continue;
        };
        if name != upload_name && name != download_name {
            continue;
        }
        let value = raw_value
            .trim()
            .parse::<u64>()
            .map_err(|_| EngineError::io(format!("invalid Xray stats value for {name}")))?;
        if name == upload_name {
            stats.upload = value;
        } else {
            stats.download = value;
        }
    }

    Ok(stats)
}

fn spawn_process_monitor(
    inner: Arc<Mutex<Runtime>>,
    exit_tx: broadcast::Sender<EngineExitEvent>,
    mut child: Child,
    generation: u64,
) -> ProcessMonitor {
    let (stop_tx, stop_rx) = oneshot::channel();
    let inner = Arc::downgrade(&inner);
    let join = tokio::spawn(async move {
        tokio::select! {
            biased;
            _ = stop_rx => {
                let _ = child.start_kill();
                let _ = child.wait().await;
            }
            result = child.wait() => {
                let (code, reason) = match result {
                    Ok(status) => (
                        status.code(),
                        format!("sidecar exited unexpectedly: {status}"),
                    ),
                    Err(error) => (
                        None,
                        format!("failed to wait for sidecar: {error}"),
                    ),
                };
                let event = EngineExitEvent {
                    generation,
                    code,
                    reason,
                };

                let should_publish = update_state_after_unexpected_exit(&inner, &event);

                if should_publish {
                    log::error!("{}", event.reason);
                    let _ = exit_tx.send(event);
                }
            }
        }
    });

    ProcessMonitor { stop_tx, join }
}

fn update_state_after_unexpected_exit(
    inner: &Weak<Mutex<Runtime>>,
    event: &EngineExitEvent,
) -> bool {
    let Some(inner) = inner.upgrade() else {
        return false;
    };
    let mut guard = inner.lock().unwrap_or_else(|error| error.into_inner());
    if guard.generation != event.generation || !matches!(guard.sm.state(), EngineState::Running) {
        return false;
    }

    guard.sm.force(EngineState::Failed {
        reason: event.reason.clone(),
    });
    guard.last_exit = Some(event.clone());
    true
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
    let _ = fs::OpenOptions::new().create(true).append(true).open(&path);
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
        .or_else(|| text.lines().map(str::trim).filter(|l| !l.is_empty()).last())
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
            // Linux deb/rpm split the sidecar (`{prefix}/bin`) from resources
            // (`{prefix}/lib/AureStream/resources`), so no relative walk from
            // the binary reaches them.
            candidates.push(grand.join("lib").join(LINUX_PRODUCT_DIR).join("resources"));
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.to_path_buf());
            candidates.push(dir.join("resources"));
            candidates.push(dir.join("resources").join("resources"));
            if let Some(grand) = dir.parent() {
                candidates.push(grand.join("lib").join(LINUX_PRODUCT_DIR).join("resources"));
            }
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
    use crate::SharedEngine;

    fn test_child(command: &str) -> Child {
        #[cfg(windows)]
        let mut child = {
            let mut cmd = Command::new("cmd");
            cmd.args(["/C", command]);
            cmd
        };

        #[cfg(not(windows))]
        let mut child = {
            let mut cmd = Command::new("sh");
            cmd.args(["-c", command]);
            cmd
        };

        child
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .spawn()
            .expect("spawn test child")
    }

    fn long_running_test_child() -> Child {
        #[cfg(windows)]
        let mut child = {
            let mut cmd = Command::new("powershell");
            cmd.args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "Start-Sleep -Seconds 30",
            ]);
            cmd
        };

        #[cfg(not(windows))]
        let mut child = {
            let mut cmd = Command::new("sleep");
            cmd.arg("30");
            cmd
        };

        child
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .spawn()
            .expect("spawn long-running test child")
    }

    fn install_test_monitor(engine: &XrayEngine, child: Child, generation: u64) {
        {
            let mut guard = engine.lock();
            guard.generation = generation;
            guard.sm.force(EngineState::Running);
        }
        let monitor = spawn_process_monitor(
            Arc::clone(&engine.inner),
            engine.exit_tx.clone(),
            child,
            generation,
        );
        engine.lock().monitor = Some(monitor);
    }

    #[test]
    fn dir_has_geo_assets_false_for_empty() {
        let dir = tempfile::tempdir().unwrap();
        assert!(!dir_has_geo_assets(dir.path()));
    }

    #[test]
    fn engine_trait_object_exposes_kernel_metadata_without_resolving_launch() {
        let missing = std::env::temp_dir().join("aurestream-missing-test-sidecar");
        let engine: SharedEngine = Arc::new(XrayEngine::with_sidecar_path(missing));

        assert_eq!(engine.config_filename(), CONFIG_FILENAME);
        assert!(engine.launch_spec().is_err());
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
    fn resolve_asset_dir_finds_linux_install_layout() {
        // deb/rpm: sidecar in `{prefix}/bin`, assets in
        // `{prefix}/lib/AureStream/resources` — no relative walk from the
        // binary's own dir reaches them.
        let root = tempfile::tempdir().unwrap();
        let bin = root.path().join("bin");
        let assets = root
            .path()
            .join("lib")
            .join(LINUX_PRODUCT_DIR)
            .join("resources");
        std::fs::create_dir_all(&bin).unwrap();
        std::fs::create_dir_all(&assets).unwrap();
        let sidecar = bin.join("aurestream-core");
        std::fs::write(&sidecar, b"x").unwrap();
        std::fs::write(assets.join(GEOIP_FILE), b"geo").unwrap();

        let found = resolve_asset_dir(&sidecar).expect("asset dir");
        assert_eq!(found, assets);
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

    #[test]
    fn parses_outbound_traffic_stats() {
        let output = r#"
stat: <
  name: "outbound>>>\u65b0\u52a0\u57612-SG>>>traffic>>>uplink"
  value: 1048576
>
stat: <
  name: "outbound>>>\u65b0\u52a0\u57612-SG>>>traffic>>>downlink"
  value: 10485760
>
stat: <
  name: "outbound>>>direct>>>traffic>>>downlink"
  value: 999999
>
"#;

        let stats = parse_outbound_traffic(output, "\u{65b0}\u{52a0}\u{5761}2-SG").unwrap();
        assert_eq!(stats.upload, 1_048_576);
        assert_eq!(stats.download, 10_485_760);
    }

    #[test]
    fn parses_outbound_traffic_stats_json() {
        let output = r#"{
            "stat": [
                {
                    "name": "outbound>>>新加坡-SG>>>traffic>>>uplink",
                    "value": 4248405
                },
                {
                    "name": "outbound>>>新加坡-SG>>>traffic>>>downlink",
                    "value": "5466304"
                },
                {
                    "name": "outbound>>>direct>>>traffic>>>downlink",
                    "value": 55637694
                }
            ]
        }"#;

        let stats = parse_outbound_traffic(output, "新加坡-SG").unwrap();
        assert_eq!(stats.upload, 4_248_405);
        assert_eq!(stats.download, 5_466_304);
    }

    #[test]
    fn omitted_json_value_is_zero() {
        let output = r#"{
            "stat": [
                { "name": "outbound>>>node-1>>>traffic>>>uplink" },
                { "name": "outbound>>>node-1>>>traffic>>>downlink" }
            ]
        }"#;

        assert_eq!(
            parse_outbound_traffic(output, "node-1").unwrap(),
            TrafficStats::default()
        );
    }

    #[test]
    fn absent_outbound_counters_are_zero() {
        assert_eq!(
            parse_outbound_traffic("", "node-1").unwrap(),
            TrafficStats::default()
        );
    }

    #[tokio::test]
    async fn unexpected_exit_sets_failed_and_publishes_event() {
        let engine = XrayEngine::new();
        let mut exits = engine.subscribe_exit_events();
        install_test_monitor(&engine, test_child("exit 23"), 7);

        let event = timeout(Duration::from_secs(2), exits.recv())
            .await
            .expect("exit event timeout")
            .expect("exit event channel");

        assert_eq!(event.generation, 7);
        assert_eq!(event.code, Some(23));
        assert!(event.reason.contains("unexpectedly"));
        assert_eq!(engine.last_exit_event(), Some(event.clone()));
        assert_eq!(
            engine.state(),
            EngineState::Failed {
                reason: event.reason
            }
        );

        engine.stop().await.expect("clear failed engine");
        assert_eq!(engine.state(), EngineState::Idle);
    }

    #[tokio::test]
    async fn explicit_stop_does_not_publish_unexpected_exit() {
        let engine = XrayEngine::new();
        let mut exits = engine.subscribe_exit_events();
        install_test_monitor(&engine, long_running_test_child(), 1);

        timeout(Duration::from_secs(2), engine.stop())
            .await
            .expect("stop timeout")
            .expect("stop engine");

        assert_eq!(engine.state(), EngineState::Idle);
        assert_eq!(engine.last_exit_event(), None);
        assert!(matches!(
            exits.try_recv(),
            Err(broadcast::error::TryRecvError::Empty)
        ));
    }
}
