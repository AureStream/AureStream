//! 首次启动：将 `aurestream.yaml` 中的 providers / nodes 导入 SQLite（subscriptions / endpoints）。

use crate::models::proxy_config::{bytes_to_gb, gb_to_bytes};
use crate::config::AureConfig;
use crate::error::AppError;
use crate::models::endpoint::{AuthInfo, Endpoint, EndpointMetadata, Protocol, TransportInfo};
use crate::models::subscription::{
    HealthStatus, Subscription, SubscriptionType,
};
use crate::storage::{endpoint_repo, subscription_repo};
use sqlx::SqlitePool;

fn ts_now() -> i64 {
    chrono::Utc::now().timestamp()
}

fn parse_rfc3339_unix(s: &str) -> Option<i64> {
    chrono::DateTime::parse_from_rfc3339(s)
        .ok()
        .map(|d| d.timestamp())
}

pub fn provider_entry_to_subscription(
    p: &crate::config::ProviderEntry,
    now: i64,
) -> Subscription {
    let traffic_total = p.traffic_total_gb.map(gb_to_bytes);
    let traffic_download = p.traffic_used_gb.map(gb_to_bytes);
    Subscription {
        id: p.id.clone(),
        name: p.name.clone(),
        url: p.url.clone(),
        sub_type: SubscriptionType::Clash,
        enabled: true,
        auto_update: p.auto_update_interval.is_some(),
        update_interval: p
            .auto_update_interval
            .map(|m| i64::from(m) * 60)
            .unwrap_or(3600),
        health_status: HealthStatus::Ok,
        health_message: None,
        node_count: p.nodes.len() as i32,
        traffic_upload: None,
        traffic_download,
        traffic_total,
        expire_at: p.expires_at.as_ref().and_then(|x| parse_rfc3339_unix(x)),
        last_success_at: None,
        last_updated_at: parse_rfc3339_unix(&p.last_updated),
        created_at: now,
        updated_at: now,
    }
}

fn protocol_from_node_type(s: &str) -> Protocol {
    Protocol::parse(s).unwrap_or(Protocol::Vmess)
}

pub fn node_entry_to_endpoint(
    entry: &crate::config::NodeEntry,
    source_id: &str,
) -> Endpoint {
    let protocol = protocol_from_node_type(&entry.node_type);
    Endpoint {
        id: entry.id.clone(),
        name: entry.name.clone(),
        protocol,
        server: entry.server.clone(),
        port: entry.port,
        udp: false,
        tls: false,
        network: None,
        auth: AuthInfo::default(),
        transport: TransportInfo::default(),
        metadata: EndpointMetadata {
            latency: entry.delay,
            ..Default::default()
        },
        source_id: source_id.to_string(),
        unique_hash: String::new(),
        raw: None,
    }
    .with_hash()
}

pub fn subscription_to_provider(s: &Subscription) -> crate::models::Provider {
    let last_updated = chrono::DateTime::from_timestamp(s.updated_at, 0)
        .map(|d| d.to_rfc3339())
        .unwrap_or_default();

    crate::models::Provider {
        id: s.id.clone(),
        name: s.name.clone(),
        url: s.url.clone(),
        last_updated,
        node_count: s.node_count.max(0) as usize,
        traffic_total_gb: s.traffic_total.map(bytes_to_gb),
        traffic_used_gb: s.traffic_upload.zip(s.traffic_download).map(|(u, d)| bytes_to_gb(u + d)),
        expires_at: s.expire_at.and_then(|ts| {
            chrono::DateTime::from_timestamp(ts, 0).map(|d| d.to_rfc3339())
        }),
        auto_update_interval: if s.auto_update {
            Some((s.update_interval / 60).max(1) as u32)
        } else {
            None
        },
    }
}

pub fn endpoint_to_node(ep: &Endpoint) -> crate::models::Node {
    crate::models::Node {
        id: ep.id.clone(),
        name: ep.name.clone(),
        provider_id: ep.source_id.clone(),
        r#type: ep.protocol.as_str().to_string(),
        server: ep.server.clone(),
        port: ep.port,
        delay: ep.metadata.latency,
        enabled: true,
    }
}

/// 若 `subscriptions` 表为空，则从内存中的 `AureConfig` 导入。
pub async fn migrate_aure_yaml_to_sqlite(pool: &SqlitePool, cfg: &AureConfig) -> Result<(), AppError> {
    let existing = subscription_repo::list_all(pool).await?;
    if !existing.is_empty() {
        return Ok(());
    }

    let now = ts_now();
    for p in &cfg.providers {
        let sub = provider_entry_to_subscription(p, now);
        subscription_repo::upsert(pool, &sub).await?;
        let endpoints: Vec<Endpoint> = p
            .nodes
            .iter()
            .map(|n| node_entry_to_endpoint(n, &p.id))
            .collect();
        if !endpoints.is_empty() {
            endpoint_repo::replace_for_source(pool, &p.id, &endpoints).await?;
        }
    }
    Ok(())
}
