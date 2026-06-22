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

#[cfg(target_os = "linux")]
pub mod linux;
#[cfg(target_os = "macos")]
pub mod macos;
#[cfg(target_os = "windows")]
pub mod windows;

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

    #[allow(dead_code)]
    fn on_network_up(_app: &tauri::AppHandle) {}
    #[allow(dead_code)]
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
    // macOS TUN mode runs sing-box as root via the privileged helper. If the app
    // crashes/exits without a clean stop, that root process leaks and keeps
    // holding the mixed/controller ports. Ask the helper to stop it (best effort).
    #[cfg(target_os = "macos")]
    {
        if let Err(e) = aurestream_plugin_privilege::macos::helper::api::stop_sing_box() {
            ::log::warn!(
                "[shutdown] helper stop_sing_box failed (may be inactive): {}",
                e
            );
        } else {
            ::log::info!("[shutdown] helper-managed sing-box stopped");
        }
    }

    // Synchronous system proxy cleanup — must complete before process exits.
    // Sysproxy::get_system_proxy / set_system_proxy are synchronous platform
    // calls, so we run them directly in the calling thread.
    match aurestream_plugin_proxy::Sysproxy::get_system_proxy() {
        Ok(mut sysproxy) => {
            if sysproxy.enable {
                sysproxy.enable = false;
                if let Err(e) = sysproxy.set_system_proxy() {
                    ::log::error!("[shutdown] Failed to unset system proxy: {}", e);
                } else {
                    ::log::info!("[shutdown] System proxy unset");
                }
            }
        }
        Err(e) => {
            ::log::error!("[shutdown] Sysproxy::get_system_proxy failed: {}", e);
        }
    }
}

/// Resolve the proxy bypass list from the store, falling back to the
/// platform-specific default when no custom value is set.
pub fn resolve_proxy_bypass(app: &tauri::AppHandle) -> String {
    use tauri_plugin_store::StoreExt;
    let raw = app
        .get_store("settings.json")
        .and_then(|s| s.get(aurestream_plugin_proxy::bypass::PROXY_BYPASS_STORE_KEY))
        .and_then(|v| v.as_str().map(String::from));
    aurestream_plugin_proxy::bypass::bypass_from_store_value(raw)
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TestEngine;

    impl EngineManager for TestEngine {
        async fn start(
            _app: &tauri::AppHandle,
            _mode: ProxyMode,
            _config_path: String,
            _start_epoch: u64,
        ) -> Result<(), String> {
            Ok(())
        }

        async fn stop(_app: &tauri::AppHandle) -> Result<(), String> {
            Ok(())
        }

        async fn restart(_app: &tauri::AppHandle) -> Result<(), String> {
            Ok(())
        }

        async fn ensure_installed(_app: &tauri::AppHandle) -> Result<(), String> {
            Ok(())
        }

        async fn uninstall_service(_app: &tauri::AppHandle) -> Result<(), String> {
            Ok(())
        }

        async fn probe(_app: &tauri::AppHandle) -> Result<String, String> {
            Ok("ok".into())
        }
    }

    #[test]
    fn start_settle_delay_matches_onebox_flow() {
        assert_eq!(
            TestEngine::start_settle_delay(&ProxyMode::SystemProxy),
            std::time::Duration::from_millis(1000)
        );
        assert_eq!(
            TestEngine::start_settle_delay(&ProxyMode::IntoProxy),
            std::time::Duration::from_millis(1500)
        );
    }
}
