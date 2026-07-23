use crate::core::commands::stop;
use crate::engine::cleanup_on_shutdown;

use tauri::AppHandle;
use tauri::Manager;

use tokio::time::{timeout, Duration};

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
