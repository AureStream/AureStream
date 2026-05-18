//! 连接管理命令：代理启停、状态查询。

use crate::models::proxy_config::{allocate_high_random_port, ProxyConfig, ProxyState};
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

#[tauri::command]
pub async fn start_proxy(proxy_state: State<'_, ProxyState>) -> Result<String, String> {
    let (listen, mixed_port) = {
        let mut config = proxy_state.config.lock().map_err(|e| e.to_string())?;
        let status = proxy_state.status.lock().map_err(|e| e.to_string())?;
        config.listen = crate::adapter::mihomo::constants::DEFAULT_LISTEN_ADDR.to_string();
        if !status.is_running || config.mixed_port == 0 {
            config.mixed_port = allocate_high_random_port()?;
        }
        (config.listen.clone(), config.mixed_port)
    };
    {
        let mut status = proxy_state.status.lock().map_err(|e| e.to_string())?;
        status.is_running = true;
    }
    Ok(format!("{}:{}", listen, mixed_port))
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
