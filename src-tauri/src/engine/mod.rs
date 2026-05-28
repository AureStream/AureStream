use serde::{Deserialize, Serialize};
use tauri::AppHandle;

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
}

pub mod common;

#[cfg(target_os = "linux")]
pub mod linux;
#[cfg(target_os = "macos")]
pub mod macos;
#[cfg(target_os = "windows")]
pub mod windows;

#[cfg(target_os = "linux")]
pub use linux::LinuxEngine as PlatformEngine;
#[cfg(target_os = "macos")]
pub use macos::MacOSEngine as PlatformEngine;
#[cfg(target_os = "windows")]
pub use windows::WindowsEngine as PlatformEngine;
