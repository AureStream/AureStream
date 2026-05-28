use tauri::AppHandle;
use crate::engine::{EngineManager, ProxyMode};

pub struct LinuxEngine;

impl EngineManager for LinuxEngine {
    async fn start(
        _app: &AppHandle,
        _mode: ProxyMode,
        _config_path: String,
        _start_epoch: u64,
    ) -> Result<(), String> {
        log::info!("[linux-engine] starting sing-box engine");
        Ok(())
    }

    async fn stop(_app: &AppHandle) -> Result<(), String> {
        log::info!("[linux-engine] stopping sing-box engine");
        Ok(())
    }

    async fn restart(_app: &AppHandle) -> Result<(), String> {
        log::info!("[linux-engine] restarting sing-box engine");
        Ok(())
    }

    async fn ensure_installed(_app: &AppHandle) -> Result<(), String> {
        Ok(())
    }

    async fn probe(_app: &AppHandle) -> Result<String, String> {
        Ok("available".into())
    }
}
