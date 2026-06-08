//! sing-box sidecar process session (child handle, mode, config path).

use lazy_static::lazy_static;
use std::sync::{Arc, Mutex};
use tauri_plugin_shell::process::CommandChild;

use crate::core::ProxyMode;

#[cfg(unix)]
pub(crate) fn pid_is_alive(pid: u32) -> bool {
    unsafe { libc::kill(pid as i32, 0) == 0 }
}

#[cfg(not(unix))]
pub(crate) fn pid_is_alive(_pid: u32) -> bool {
    true
}

pub(crate) struct ProcessManager {
    pub(crate) child: Option<CommandChild>,
    pub(crate) mode: Option<Arc<ProxyMode>>,
    pub(crate) config_path: Option<Arc<String>>,
    pub(crate) is_stopping: bool,
}

impl ProcessManager {
    pub(crate) fn acquire() -> std::sync::MutexGuard<'static, ProcessManager> {
        PROCESS_MANAGER.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub(crate) fn reset(&mut self) {
        self.child = None;
        self.mode = None;
        self.config_path = None;
        self.is_stopping = false;
    }
}

lazy_static! {
    pub(crate) static ref PROCESS_MANAGER: Arc<Mutex<ProcessManager>> =
        Arc::new(Mutex::new(ProcessManager {
            child: None,
            mode: None,
            config_path: None,
            is_stopping: false,
        }));
}

pub(crate) fn pm_snapshot() -> (Option<u32>, Option<bool>, Option<ProxyMode>) {
    let mgr = ProcessManager::acquire();
    let pid = mgr.child.as_ref().map(|c| c.pid());
    let alive = pid.map(pid_is_alive);
    let mode = mgr.mode.as_ref().map(|m| (**m).clone());
    (pid, alive, mode)
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
pub(crate) fn running_config() -> Option<(ProxyMode, String)> {
    let manager = ProcessManager::acquire();
    match (manager.mode.as_ref(), manager.config_path.as_ref()) {
        (Some(mode), Some(path)) => Some(((**mode).clone(), (**path).clone())),
        _ => None,
    }
}
