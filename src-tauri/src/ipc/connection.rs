//! 连接管理命令：代理启停、状态查询。

use crate::adapter::mihomo::constants::DEFAULT_MIXED_PORT;
use crate::models::proxy_config::{ProxyConfig, ProxyState};
use crate::runtime::RuntimeManager;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyStatus {
    pub is_running: bool,
    pub current_node: Option<String>,
    pub upload_bytes: u64,
    pub download_bytes: u64,
}

/// 准备代理端口（不启动进程，仅分配端口）。
/// 实际进程启停由 [`crate::commands::mihomo_kernel::start_runtime_engine`] 负责。
#[tauri::command]
pub async fn start_proxy(proxy_state: State<'_, ProxyState>) -> Result<String, String> {
    let mixed_port = {
        let mut config = proxy_state.config.lock().map_err(|e| e.to_string())?;
        if config.mixed_port == 0 {
            config.mixed_port = DEFAULT_MIXED_PORT;
        }
        config.mixed_port
    };
    Ok(format!(
        "{}:{}",
        crate::adapter::mihomo::constants::DEFAULT_LISTEN_ADDR,
        mixed_port
    ))
}

#[tauri::command]
pub async fn stop_proxy(
    rt: State<'_, RuntimeManager>,
    proxy_state: State<'_, ProxyState>,
) -> Result<String, String> {
    rt.stop_sidecar().await?;
    let mut status = proxy_state.status.lock().map_err(|e| e.to_string())?;
    status.is_running = false;
    status.current_node = None;
    let mut config = proxy_state.config.lock().map_err(|e| e.to_string())?;
    config.mixed_port = 0;
    Ok("已断开连接".into())
}

#[tauri::command]
pub async fn get_proxy_status(proxy_state: State<'_, ProxyState>) -> Result<ProxyStatus, String> {
    let status = proxy_state.status.lock().map_err(|e| e.to_string())?;
    Ok(ProxyStatus {
        is_running: status.is_running,
        current_node: status.current_node.clone(),
        upload_bytes: status.upload_bytes,
        download_bytes: status.download_bytes,
    })
}

#[tauri::command]
pub async fn set_current_node(
    proxy_state: State<'_, ProxyState>,
    node_name: String,
) -> Result<(), String> {
    let mut status = proxy_state.status.lock().map_err(|e| e.to_string())?;
    status.current_node = Some(node_name);
    Ok(())
}

#[tauri::command]
pub async fn update_proxy_config(
    proxy_state: State<'_, ProxyState>,
    config: ProxyConfig,
) -> Result<(), String> {
    let mut current = proxy_state.config.lock().map_err(|e| e.to_string())?;
    *current = config;
    Ok(())
}

#[tauri::command]
pub async fn get_proxy_config(
    proxy_state: State<'_, ProxyState>,
) -> Result<ProxyConfig, String> {
    let config = proxy_state.config.lock().map_err(|e| e.to_string())?;
    Ok(config.clone())
}
