use crate::app::state::{AppData, LogType};
use crate::core::stop;

use tauri::AppHandle;
use tauri::Manager;

use tauri_plugin_shell::ShellExt;

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
    if let Err(e) = stop(app.clone()).await {
        log::error!("Failed to stop proxy: {}", e);
    } else {
        log::info!("Proxy stopped successfully.");
        log::info!("Application stopped successfully.");
        app.exit(0);
    }
}

pub fn sync_quit(app: AppHandle) {
    tauri::async_runtime::block_on(quit(app));
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
    let sidecar_command = app.shell().sidecar("sing-box").map_err(|e| e.to_string())?;
    let output = sidecar_command
        .arg("version")
        .output()
        .await
        .map_err(|e| e.to_string())?;
    String::from_utf8(output.stdout).map_err(|e| e.to_string())
}
