//! 本地代理内核侧进程 IPC — 委托 [`crate::runtime::RuntimeManager`]（当前实现为 Mihomo sidecar）。

use std::path::PathBuf;

use tauri::{AppHandle, State};

use crate::commands::proxy::ProxyState;
use crate::runtime::RuntimeManager;

/// 预下载规则路由数据库（GeoIP/GeoSite 等）到运行时工作目录。
#[tauri::command]
pub async fn prefetch_rule_assets(app: AppHandle) -> Result<(), String> {
    crate::runtime::prefetch_rule_assets(app).await
}

/// 启动（或重启）本地代理内核：`-f` 为运行时 YAML，`-d` 为 `app_local_data_dir()/mihomo-work`。
#[tauri::command]
pub async fn start_runtime_engine(
    app: AppHandle,
    rt: State<'_, RuntimeManager>,
    proxy_state: State<'_, ProxyState>,
    runtime_config_path: String,
) -> Result<(), String> {
    let proxy_cfg = proxy_state.config.lock().map_err(|e| e.to_string())?.clone();
    rt.spawn_sidecar_with_config(&app, PathBuf::from(runtime_config_path), proxy_cfg)
        .await
        .map_err(|e| {
            if let Ok(mut status) = proxy_state.status.lock() {
                status.is_running = false;
            }
            e
        })?;
    let mut status = proxy_state.status.lock().map_err(|e| e.to_string())?;
    status.is_running = true;
    Ok(())
}

#[tauri::command]
pub async fn stop_runtime_engine(rt: State<'_, RuntimeManager>) -> Result<(), String> {
    rt.stop_sidecar().await
}
