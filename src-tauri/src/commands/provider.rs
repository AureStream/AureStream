use crate::commands::mihomo_constants::{LATENCY_TEST_TCP_HOST, LATENCY_TEST_TCP_PORT};
use crate::commands::{LatencyResult, Node, Provider};
use crate::config::{AureConfigState, NodeEntry, ProviderEntry};
use tauri::State;

fn provider_entry_to_provider(entry: &ProviderEntry) -> Provider {
    Provider {
        id: entry.id.clone(),
        name: entry.name.clone(),
        url: entry.url.clone(),
        last_updated: entry.last_updated.clone(),
        node_count: entry.node_count,
        traffic_total_gb: entry.traffic_total_gb,
        traffic_used_gb: entry.traffic_used_gb,
        expires_at: entry.expires_at.clone(),
        auto_update_interval: entry.auto_update_interval,
    }
}

fn provider_to_entry(p: &Provider) -> ProviderEntry {
    ProviderEntry {
        id: p.id.clone(),
        name: p.name.clone(),
        url: p.url.clone(),
        last_updated: p.last_updated.clone(),
        node_count: p.node_count,
        traffic_total_gb: p.traffic_total_gb,
        traffic_used_gb: p.traffic_used_gb,
        expires_at: p.expires_at.clone(),
        auto_update_interval: p.auto_update_interval,
        nodes: Vec::new(),
    }
}

fn node_entry_to_node(entry: &NodeEntry, provider_id: &str) -> Node {
    Node {
        id: entry.id.clone(),
        name: entry.name.clone(),
        provider_id: provider_id.to_string(),
        r#type: entry.node_type.clone(),
        server: entry.server.clone(),
        port: entry.port,
        delay: entry.delay,
        enabled: entry.enabled,
    }
}

#[tauri::command]
pub fn add_provider(state: State<AureConfigState>, provider: Provider) -> Result<(), String> {
    state.get_mut_and_save(|cfg| {
        cfg.providers.push(provider_to_entry(&provider));
    })
}

#[tauri::command]
pub fn update_provider(
    state: State<AureConfigState>,
    id: String,
    updates: Provider,
) -> Result<(), String> {
    state.get_mut_and_save(|cfg| {
        if let Some(p) = cfg.providers.iter_mut().find(|p| p.id == id) {
            p.name = updates.name;
            p.url = updates.url;
            p.last_updated = updates.last_updated;
            p.node_count = updates.node_count;
            p.traffic_total_gb = updates.traffic_total_gb;
            p.traffic_used_gb = updates.traffic_used_gb;
            p.expires_at = updates.expires_at;
            p.auto_update_interval = updates.auto_update_interval;
        }
    })
}

#[tauri::command]
pub fn delete_provider(state: State<AureConfigState>, id: String) -> Result<(), String> {
    state.get_mut_and_save(|cfg| {
        cfg.providers.retain(|p| p.id != id);
        // Clean up latency cache entries for this provider
        let prefix = format!("{}:", id);
        cfg.latency_cache.retain(|k, _| !k.starts_with(&prefix));
    })
}

#[tauri::command]
pub fn get_providers(state: State<AureConfigState>) -> Result<Vec<Provider>, String> {
    let cfg = state.get();
    Ok(cfg
        .providers
        .iter()
        .map(provider_entry_to_provider)
        .collect())
}

#[tauri::command]
pub fn get_nodes(state: State<AureConfigState>) -> Result<Vec<Node>, String> {
    let cfg = state.get();
    let mut nodes = Vec::new();
    for provider in &cfg.providers {
        for node in &provider.nodes {
            nodes.push(node_entry_to_node(node, &provider.id));
        }
    }
    Ok(nodes)
}

#[tauri::command]
pub fn get_nodes_by_provider(
    state: State<AureConfigState>,
    provider_id: String,
) -> Result<Vec<Node>, String> {
    let cfg = state.get();
    if let Some(provider) = cfg.providers.iter().find(|p| p.id == provider_id) {
        Ok(provider
            .nodes
            .iter()
            .map(|n| node_entry_to_node(n, &provider.id))
            .collect())
    } else {
        Ok(Vec::new())
    }
}

async fn tcp_latency_to_health_check_host() -> (Option<u32>, Option<String>) {
    let addr = format!("{}:{}", LATENCY_TEST_TCP_HOST, LATENCY_TEST_TCP_PORT);
    let start = std::time::Instant::now();

    match tokio::time::timeout(
        std::time::Duration::from_secs(5),
        tokio::net::TcpStream::connect(&addr),
    )
    .await
    {
        Ok(Ok(_)) => (Some(start.elapsed().as_millis() as u32), None::<String>),
        Ok(Err(e)) => (None, Some(e.to_string())),
        Err(_) => (None, Some("Connection timeout".to_string())),
    }
}

#[tauri::command]
#[allow(unused_variables)]
pub async fn test_node_latency(node_id: String, server: String, port: u16) -> LatencyResult {
    let (delay, error) = tcp_latency_to_health_check_host().await;
    LatencyResult {
        node_id,
        delay,
        error,
    }
}

#[tauri::command]
pub async fn test_all_nodes_latency(
    state: State<'_, AureConfigState>,
) -> Result<Vec<LatencyResult>, String> {
    let node_ids: Vec<String> = {
        let cfg = state.get();
        cfg.providers
            .iter()
            .flat_map(|p| &p.nodes)
            .filter(|n| n.enabled)
            .map(|n| n.id.clone())
            .collect()
    };

    if node_ids.is_empty() {
        return Ok(Vec::new());
    }

    let (delay, error) = tcp_latency_to_health_check_host().await;
    let results = node_ids
        .into_iter()
        .map(|node_id| LatencyResult {
            node_id,
            delay,
            error: error.clone(),
        })
        .collect();
    Ok(results)
}
