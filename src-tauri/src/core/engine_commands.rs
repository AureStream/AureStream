use tauri::AppHandle;

use crate::engine::{EngineManager, PlatformEngine};

#[tauri::command]
pub async fn engine_ensure_installed(app: AppHandle) -> Result<(), String> {
    PlatformEngine::ensure_installed(&app).await
}

#[tauri::command]
pub async fn engine_uninstall_service(app: AppHandle) -> Result<(), String> {
    PlatformEngine::uninstall_service(&app).await
}

#[tauri::command]
pub async fn engine_probe(app: AppHandle) -> Result<String, String> {
    PlatformEngine::probe(&app).await
}
