pub mod config_check;
pub mod helper;
pub mod log;
pub mod monitor;
pub mod perf;
pub mod ports;
pub mod process;
pub mod readiness;
pub mod shutdown;
pub mod state_machine;

#[cfg(target_os = "macos")]
pub mod macos;
#[cfg(target_os = "windows")]
pub mod windows;
#[cfg(target_os = "linux")]
pub mod linux;

#[cfg(target_os = "macos")]
pub type PlatformEngine = macos::MacOSEngine;
#[cfg(target_os = "windows")]
pub type PlatformEngine = windows::WindowsEngine;
#[cfg(target_os = "linux")]
pub type PlatformEngine = linux::LinuxEngine;

use serde::{Deserialize, Serialize};

#[derive(Clone, Default, PartialEq, Serialize, Deserialize, Debug)]
pub enum ProxyMode {
    #[default]
    SystemProxy,
    IntoProxy,
}

#[allow(async_fn_in_trait)]
pub trait EngineManager {
    async fn start(
        app: &tauri::AppHandle,
        mode: ProxyMode,
        config_path: String,
        start_epoch: u64,
    ) -> Result<(), String>;

    async fn stop(app: &tauri::AppHandle) -> Result<(), String>;

    async fn restart(app: &tauri::AppHandle) -> Result<(), String>;

    fn on_network_up(_app: &tauri::AppHandle) {}
    fn on_network_down(_app: &tauri::AppHandle) {}
    fn on_process_terminated(_app: &tauri::AppHandle, _was_user_stop: bool) {}

    async fn ensure_installed(app: &tauri::AppHandle) -> Result<(), String>;
    async fn uninstall_service(app: &tauri::AppHandle) -> Result<(), String>;
    async fn probe(app: &tauri::AppHandle) -> Result<String, String>;

    fn start_settle_delay(mode: &ProxyMode) -> std::time::Duration {
        match mode {
            ProxyMode::IntoProxy => std::time::Duration::from_millis(1500),
            ProxyMode::SystemProxy => std::time::Duration::from_millis(1000),
        }
    }
}

pub fn cleanup_on_shutdown() {
    let mut sysproxy = match aurestream_plugin_proxy::Sysproxy::get_system_proxy() {
        Ok(proxy) => proxy,
        Err(e) => {
            ::log::error!("Sysproxy::get_system_proxy failed during shutdown: {}", e);
            return;
        }
    };
    sysproxy.enable = false;
    if let Err(e) = sysproxy.set_system_proxy() {
        ::log::error!("Failed to unset system proxy during shutdown: {}", e);
    } else {
        ::log::info!("System proxy unset during shutdown");
    }
}
