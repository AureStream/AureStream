use crate::bootstrap::{self, subscription_to_provider};
use crate::commands::{LatencyResult, Node, Provider};
use crate::config::{AureConfigState, NodeEntry, ProviderEntry};
use crate::runtime::RuntimeManager;
use crate::storage::{endpoint_repo, subscription_repo};
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

async fn upsert_subscription_from_entry(
    rt: &RuntimeManager,
    entry: &ProviderEntry,
) -> Result<(), String> {
    let now = chrono::Utc::now().timestamp();
    let sub = bootstrap::provider_entry_to_subscription(entry, now);
    subscription_repo::upsert(rt.pool(), &sub)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_provider(
    rt: State<'_, RuntimeManager>,
    state: State<'_, AureConfigState>,
    provider: Provider,
) -> Result<(), String> {
    let entry = provider_to_entry(&provider);
    state.get_mut_and_save(|cfg| {
        cfg.providers.push(entry.clone());
    })?;
    upsert_subscription_from_entry(&rt, &entry).await
}

#[tauri::command]
pub async fn update_provider(
    rt: State<'_, RuntimeManager>,
    state: State<'_, AureConfigState>,
    id: String,
    updates: Provider,
) -> Result<(), String> {
    let mut updated_entry: Option<ProviderEntry> = None;
    state.get_mut_and_save(|cfg| {
        if let Some(p) = cfg.providers.iter_mut().find(|p| p.id == id) {
            p.name = updates.name.clone();
            p.url = updates.url.clone();
            p.last_updated = updates.last_updated.clone();
            p.node_count = updates.node_count;
            p.traffic_total_gb = updates.traffic_total_gb;
            p.traffic_used_gb = updates.traffic_used_gb;
            p.expires_at = updates.expires_at.clone();
            p.auto_update_interval = updates.auto_update_interval;
            updated_entry = Some(p.clone());
        }
    })?;
    if let Some(entry) = updated_entry {
        upsert_subscription_from_entry(&rt, &entry).await?;
    }
    Ok(())
}

#[tauri::command]
pub async fn delete_provider(
    rt: State<'_, RuntimeManager>,
    state: State<'_, AureConfigState>,
    id: String,
) -> Result<(), String> {
    subscription_repo::delete(rt.pool(), &id)
        .await
        .map_err(|e| e.to_string())?;
    state.get_mut_and_save(|cfg| {
        cfg.providers.retain(|p| p.id != id);
        let prefix = format!("{}:", id);
        cfg.latency_cache.retain(|k, _| !k.starts_with(&prefix));
    })?;
    Ok(())
}

#[tauri::command]
pub async fn get_providers(
    rt: State<'_, RuntimeManager>,
    state: State<'_, AureConfigState>,
) -> Result<Vec<Provider>, String> {
    let rows = subscription_repo::list_all(rt.pool())
        .await
        .map_err(|e| e.to_string())?;
    if !rows.is_empty() {
        return Ok(rows.into_iter().map(|s| subscription_to_provider(&s)).collect());
    }
    let cfg = state.get();
    Ok(cfg
        .providers
        .iter()
        .map(provider_entry_to_provider)
        .collect())
}

#[tauri::command]
pub async fn get_nodes(
    rt: State<'_, RuntimeManager>,
    state: State<'_, AureConfigState>,
) -> Result<Vec<Node>, String> {
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
            nodes.push(node_entry_to_node(node, &provider.id));
        }
    }
    Ok(nodes)
}

#[tauri::command]
pub async fn get_nodes_by_provider(
    rt: State<'_, RuntimeManager>,
    state: State<'_, AureConfigState>,
    provider_id: String,
) -> Result<Vec<Node>, String> {
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
            .map(|n| node_entry_to_node(n, &provider.id))
            .collect())
    } else {
        Ok(Vec::new())
    }
}

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

#[tauri::command]
pub async fn test_all_nodes_latency(
    rt: State<'_, RuntimeManager>,
) -> Result<Vec<LatencyResult>, String> {
    let eps = endpoint_repo::list_all(rt.pool())
        .await
        .map_err(|e| e.to_string())?;
    let mut out = Vec::with_capacity(eps.len());
    for ep in eps {
        out.push(
            test_node_latency(ep.id.clone(), ep.server.clone(), ep.port).await,
        );
    }
    Ok(out)
}
