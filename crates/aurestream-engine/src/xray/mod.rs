//! Xray-core sidecar process management.

mod config;

pub use config::write_xray_config;

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use aurestream_config::ProxyNode;
use tokio::net::TcpStream;
use tokio::process::{Child, Command};
use tokio::time::{sleep, timeout, Instant};

use crate::state::{EngineState, StateMachine};
use crate::{Engine, EngineError};

const STARTUP_TIMEOUT: Duration = Duration::from_secs(10);
const PROBE_CONNECT_TIMEOUT: Duration = Duration::from_millis(100);
const POLL_INTERVAL: Duration = Duration::from_millis(100);
const SIDECAR_NAME: &str = "aurestream-core";

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
        }
    }

    /// Prefer an explicit binary path (tests / custom installs).
    pub fn with_sidecar_path(path: impl Into<PathBuf>) -> Self {
        let mut eng = Self::new();
        eng.sidecar_override = Some(path.into());
        eng
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

        let mut child = match Command::new(&sidecar)
            .args(["run", "-c", &config_str])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .spawn()
        {
            Ok(c) => c,
            Err(e) => {
                let reason = format!("spawn sidecar {}: {e}", sidecar.display());
                let mut guard = self.lock();
                let _ = guard.sm.transition(EngineState::Failed {
                    reason: reason.clone(),
                });
                return Err(EngineError::io(reason));
            }
        };

        let ready = wait_until_ready(socks_port, api_port, &mut child).await;

        if !ready {
            let _ = child.kill().await;
            let _ = child.wait().await;
            let reason = format!(
                "startup timeout: socks :{socks_port} / api :{api_port} not ready"
            );
            let mut guard = self.lock();
            let _ = guard.sm.transition(EngineState::Failed {
                reason: reason.clone(),
            });
            return Err(EngineError::not_ready(reason));
        }

        let mut guard = self.lock();
        guard.child = Some(child);
        guard.sm.transition(EngineState::Running)?;
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
            let _ = c.kill().await;
            let _ = c.wait().await;
        }

        let mut guard = self.lock();
        if matches!(guard.sm.state(), EngineState::Stopping) {
            guard.sm.transition(EngineState::Idle)?;
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

/// Shared handle type for AppState (Task 9).
pub type SharedXrayEngine = Arc<XrayEngine>;
