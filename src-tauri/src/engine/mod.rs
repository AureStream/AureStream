use serde::{Deserialize, Serialize};
use tauri::AppHandle;

pub const EVENT_TAURI_LOG: &str = "tauri-log";
pub const EVENT_STATUS_CHANGED: &str = "status-changed";

#[derive(Clone, Default, PartialEq, Serialize, Deserialize, Debug)]
pub enum ProxyMode {
    #[default]
    SystemProxy,
    ManualProxy,
    IntoProxy,
}

#[allow(async_fn_in_trait)]
pub trait EngineManager {
    async fn start(
        app: &AppHandle,
        mode: ProxyMode,
        config_path: String,
        start_epoch: u64,
    ) -> Result<(), String>;

    async fn stop(app: &AppHandle) -> Result<(), String>;

    async fn restart(app: &AppHandle) -> Result<(), String>;

    fn on_network_up(_app: &AppHandle) {}
    fn on_network_down(_app: &AppHandle) {}
    fn on_process_terminated(_app: &AppHandle, _was_user_stop: bool) {}

    async fn ensure_installed(app: &AppHandle) -> Result<(), String>;
    async fn probe(app: &AppHandle) -> Result<String, String>;

    fn start_settle_delay(mode: &ProxyMode) -> std::time::Duration {
        match mode {
            ProxyMode::IntoProxy => std::time::Duration::from_millis(1500),
            ProxyMode::SystemProxy | ProxyMode::ManualProxy => {
                std::time::Duration::from_millis(1000)
            }
        }
    }
}

pub mod common;
pub(crate) use common::sysproxy;
pub use common::{helper, readiness, state_machine};

#[cfg(target_os = "linux")]
pub mod linux;
#[cfg(target_os = "macos")]
pub mod macos;
#[cfg(target_os = "windows")]
pub mod windows;

#[tauri::command]
pub async fn engine_ensure_installed(app: AppHandle) -> Result<(), String> {
    PlatformEngine::ensure_installed(&app).await
}

#[tauri::command]
pub async fn engine_probe(app: AppHandle) -> Result<String, String> {
    PlatformEngine::probe(&app).await
}

#[cfg(target_os = "linux")]
pub use linux::LinuxEngine as PlatformEngine;
#[cfg(target_os = "macos")]
pub use macos::MacOSEngine as PlatformEngine;
#[cfg(target_os = "windows")]
pub use windows::WindowsEngine as PlatformEngine;

pub(crate) use sysproxy::clear_system_proxy;
pub(crate) use sysproxy::set_system_proxy as apply_system_proxy;

pub fn cleanup_on_shutdown() {
    use sysproxy_rs::Sysproxy;
    let mut sysproxy = match Sysproxy::get_system_proxy() {
        Ok(proxy) => proxy,
        Err(e) => {
            log::error!("Sysproxy::get_system_proxy failed during shutdown: {}", e);
            return;
        }
    };
    sysproxy.enable = false;
    if let Err(e) = sysproxy.set_system_proxy() {
        log::error!("Failed to unset system proxy during shutdown: {}", e);
    } else {
        log::info!("System proxy unset during shutdown");
    }
}
