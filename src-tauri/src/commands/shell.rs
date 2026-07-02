use crate::core::commands::stop;
use crate::engine::cleanup_on_shutdown;
use crate::state::{AppData, LogType};

use tauri::AppHandle;
use tauri::Manager;

use tauri_plugin_shell::ShellExt;
use tokio::time::{timeout, Duration};

#[tauri::command]
pub fn open_directory(path: String) -> Result<(), String> {
    use std::process::Command;

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open directory: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open directory: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open directory: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub fn get_app_version(app: AppHandle) -> String {
    let package_info = app.package_info();
    package_info.version.to_string()
}

#[tauri::command]
pub fn get_config_json_path(app: AppHandle) -> Result<String, String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok(config_dir
        .join("config.json")
        .to_string_lossy()
        .into_owned())
}

#[tauri::command]
pub fn get_app_paths(app: AppHandle) -> Result<serde_json::Value, String> {
    let paths = serde_json::json!({
        "log_dir": app.path().app_log_dir().map_err(|e| e.to_string())?,
        "data_dir": app.path().app_data_dir().map_err(|e| e.to_string())?,
        "cache_dir": app.path().app_cache_dir().map_err(|e| e.to_string())?,
        "config_dir": app.path().app_config_dir().map_err(|e| e.to_string())?,
        "local_data_dir": app.path().app_local_data_dir().map_err(|e| e.to_string())?,
    });
    Ok(paths)
}

#[tauri::command]
pub fn open_devtools(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        window.open_devtools();
    }
}

#[tauri::command]
pub async fn quit(app: AppHandle) {
    log::info!("[quit] starting graceful shutdown...");

    // TUN mode stop can involve helper IPC, DNS restore, port release polling,
    // and aggressive fallback (kill_orphans + retry). The stop() implementation
    // itself has internal timeouts; this outer timeout is a hard deadline to
    // prevent the quit command from hanging indefinitely.
    const STOP_TIMEOUT: Duration = Duration::from_secs(5);

    match timeout(STOP_TIMEOUT, stop(app.clone())).await {
        Ok(Ok(())) => log::info!("[quit] proxy stopped successfully"),
        Ok(Err(e)) => log::error!("[quit] failed to stop proxy: {}", e),
        Err(_) => log::error!(
            "[quit] timed out after {:?} waiting for proxy to stop, exiting anyway",
            STOP_TIMEOUT
        ),
    }

    // Belt-and-suspenders: after the stop attempt (regardless of outcome),
    // run synchronous cleanup before exit. This ensures system proxy is
    // cleared and the privileged helper is told to stop, even if the
    // normal stop() path missed something.
    cleanup_on_shutdown();

    log::info!("[quit] exiting application");
    app.exit(0);
}

#[tauri::command]
pub async fn restart(app: AppHandle) {
    log::info!("Restarting application...");
    match timeout(Duration::from_secs(5), stop(app.clone())).await {
        Ok(Ok(())) => {
            log::info!("Proxy stopped successfully, proceeding with restart.");
        }
        Ok(Err(e)) => {
            log::error!("Failed to stop proxy before restart: {}", e);
        }
        Err(_) => {
            log::error!("Timed out waiting for proxy to stop, restarting anyway");
        }
    }
    app.restart();
}

#[tauri::command]
pub fn read_logs(app_data: tauri::State<AppData>, is_error: bool) -> String {
    let log_type = if is_error {
        LogType::Error
    } else {
        LogType::Info
    };
    app_data.read_cleared(log_type)
}

#[tauri::command]
pub fn get_pending_deep_link(
    app_data: tauri::State<AppData>,
) -> Option<crate::state::DeepLinkPayload> {
    if let Ok(mut pending) = app_data.pending_deep_link.lock() {
        pending.take()
    } else {
        None
    }
}

#[tauri::command]
pub async fn version(app: tauri::AppHandle) -> Result<String, String> {
    let sidecar_command = app
        .shell()
        .sidecar("aurestream-core")
        .unwrap()
        .env("ENABLE_DEPRECATED_LEGACY_DNS_SERVERS", "true");
    let output = sidecar_command
        .arg("version")
        .output()
        .await
        .map_err(|e| e.to_string())?;
    String::from_utf8(output.stdout).map_err(|e| e.to_string())
}
