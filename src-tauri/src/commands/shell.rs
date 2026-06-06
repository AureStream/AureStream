use crate::app::state::{AppData, LogType};
use crate::core::stop;

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
    Ok(config_dir.join("config.json").to_string_lossy().into_owned())
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
    let window = app.get_webview_window("main").unwrap();
    window.open_devtools();
}

#[tauri::command]
pub async fn quit(app: AppHandle) {
    log::info!("Quitting application...");
    match timeout(Duration::from_secs(5), stop(app.clone())).await {
        Ok(Ok(())) => {
            log::info!("Proxy stopped successfully.");
            log::info!("Application stopped successfully.");
            app.exit(0);
        }
        Ok(Err(e)) => {
            log::error!("Failed to stop proxy: {}", e);
            app.exit(0);
        }
        Err(_) => {
            log::error!("Timed out waiting for proxy to stop, exiting anyway");
            app.exit(0);
        }
    }
}

pub fn sync_quit(app: AppHandle) {
    tauri::async_runtime::block_on(quit(app));
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
) -> Option<crate::app::state::DeepLinkPayload> {
    if let Ok(mut pending) = app_data.pending_deep_link.lock() {
        pending.take()
    } else {
        None
    }
}

#[tauri::command]
pub async fn version(app: tauri::AppHandle) -> Result<String, String> {
    let sidecar_command = app.shell().sidecar("aurestream-core").map_err(|e| e.to_string())?;
    let output = sidecar_command
        .arg("version")
        .output()
        .await
        .map_err(|e| e.to_string())?;
    String::from_utf8(output.stdout).map_err(|e| e.to_string())
}
