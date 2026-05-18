//! 节点管理命令：查询、延迟测试。

use crate::bootstrap;
use crate::models::LatencySample as LatencyResult;
use crate::config::AureConfigState;
use crate::runtime::RuntimeManager;
use crate::storage::endpoint_repo;
use tauri::State;

/// 获取所有节点（优先从 SQLite，fallback 到 YAML 配置）。
#[tauri::command]
pub async fn get_nodes(
    rt: State<'_, RuntimeManager>,
    state: State<'_, AureConfigState>,
) -> Result<Vec<crate::models::Node>, String> {
    let eps = endpoint_repo::list_all(rt.pool())
        .await
        .map_err(|e| e.to_string())?;
    if !eps.is_empty() {
        return Ok(eps.iter().map(bootstrap::endpoint_to_node).collect());
    }
    let cfg = state.get();
    let mut nodes = Vec::new();
    for provider in &cfg.providers {
        for node in &provider.nodes {
            nodes.push(crate::models::Node {
                id: node.id.clone(),
                name: node.name.clone(),
                provider_id: provider.id.clone(),
                r#type: node.node_type.clone(),
                server: node.server.clone(),
                port: node.port,
                delay: node.delay,
                enabled: node.enabled,
            });
        }
    }
    Ok(nodes)
}

/// 按订阅 ID 获取节点。
#[tauri::command]
pub async fn get_nodes_by_provider(
    rt: State<'_, RuntimeManager>,
    state: State<'_, AureConfigState>,
    provider_id: String,
) -> Result<Vec<crate::models::Node>, String> {
    let eps = endpoint_repo::list_by_source(rt.pool(), &provider_id)
        .await
        .map_err(|e| e.to_string())?;
    if !eps.is_empty() {
        return Ok(eps.iter().map(bootstrap::endpoint_to_node).collect());
    }
    let cfg = state.get();
    if let Some(provider) = cfg.providers.iter().find(|p| p.id == provider_id) {
        Ok(provider
            .nodes
            .iter()
            .map(|n| crate::models::Node {
                id: n.id.clone(),
                name: n.name.clone(),
                provider_id: provider.id.clone(),
                r#type: n.node_type.clone(),
                server: n.server.clone(),
                port: n.port,
                delay: n.delay,
                enabled: n.enabled,
            })
            .collect())
    } else {
        Ok(Vec::new())
    }
}

/// TCP 连接测试单节点延迟。
#[tauri::command]
pub async fn test_node_latency(node_id: String, server: String, port: u16) -> LatencyResult {
    let addr = format!("{}:{}", server.trim(), port);
    let start = std::time::Instant::now();

    match tokio::time::timeout(
        std::time::Duration::from_secs(5),
        tokio::net::TcpStream::connect(addr),
    )
    .await
    {
        Ok(Ok(_)) => LatencyResult {
            node_id,
            delay: Some(start.elapsed().as_millis() as u32),
            error: None,
        },
        Ok(Err(e)) => LatencyResult {
            node_id,
            delay: None,
            error: Some(e.to_string()),
        },
        Err(_) => LatencyResult {
            node_id,
            delay: None,
            error: Some("连接超时".into()),
        },
    }
}

/// 批量测试所有节点延迟。
#[tauri::command]
pub async fn test_all_nodes_latency(
    rt: State<'_, RuntimeManager>,
) -> Result<Vec<LatencyResult>, String> {
    let eps = endpoint_repo::list_all(rt.pool())
        .await
        .map_err(|e| e.to_string())?;
    let mut out = Vec::with_capacity(eps.len());
    for ep in eps {
        out.push(test_node_latency(ep.id.clone(), ep.server.clone(), ep.port).await);
    }
    Ok(out)
}
