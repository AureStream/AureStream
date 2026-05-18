//! 订阅管理命令：CRUD + 下载。

use crate::bootstrap;
use crate::config::{AureConfigState, ProviderEntry};
use crate::runtime::RuntimeManager;
use crate::storage::{endpoint_repo, subscription_repo};
use crate::subscription::fetcher::{Fetcher, FetchResult, SubscriptionMeta, parse_yaml_meta};
use crate::subscription::ParserRegistry;
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

/// 下载结果（返回给前端）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadResult {
    pub path: String,
    pub content_length: usize,
    pub meta: Option<SubscriptionMeta>,
    pub debug_headers: Vec<(String, String)>,
}

fn stub_provider_entry(id: &str, url: &str) -> ProviderEntry {
    ProviderEntry {
        id: id.to_string(),
        name: id.to_string(),
        url: url.to_string(),
        last_updated: String::new(),
        node_count: 0,
        traffic_total_gb: None,
        traffic_used_gb: None,
        expires_at: None,
        auto_update_interval: None,
        nodes: Vec::new(),
    }
}

async fn ensure_subscription_row(
    rt: &RuntimeManager,
    state: &AureConfigState,
    provider_id: &str,
    url: &str,
) -> Result<(), String> {
    let entry = state
        .get()
        .providers
        .iter()
        .find(|p| p.id == provider_id)
        .cloned()
        .unwrap_or_else(|| stub_provider_entry(provider_id, url));
    let now = chrono::Utc::now().timestamp();
    let sub = bootstrap::provider_entry_to_subscription(&entry, now);
    subscription_repo::upsert(rt.pool(), &sub)
        .await
        .map_err(|e| format!("写入 subscriptions 失败: {e}"))
}

/// 添加订阅（Provider 概念，前端传入）。
#[tauri::command]
pub async fn add_provider(
    rt: State<'_, RuntimeManager>,
    state: State<'_, AureConfigState>,
    provider: crate::models::Provider,
) -> Result<(), String> {
    let entry = ProviderEntry {
        id: provider.id.clone(),
        name: provider.name.clone(),
        url: provider.url.clone(),
        last_updated: provider.last_updated.clone(),
        node_count: provider.node_count,
        traffic_total_gb: provider.traffic_total_gb,
        traffic_used_gb: provider.traffic_used_gb,
        expires_at: provider.expires_at.clone(),
        auto_update_interval: provider.auto_update_interval,
        nodes: Vec::new(),
    };
    state.get_mut_and_save(|cfg| {
        cfg.providers.push(entry.clone());
    })?;
    let now = chrono::Utc::now().timestamp();
    let sub = bootstrap::provider_entry_to_subscription(&entry, now);
    subscription_repo::upsert(rt.pool(), &sub)
        .await
        .map_err(|e| e.to_string())
}

/// 更新订阅。
#[tauri::command]
pub async fn update_provider(
    rt: State<'_, RuntimeManager>,
    state: State<'_, AureConfigState>,
    id: String,
    updates: crate::models::Provider,
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
        let now = chrono::Utc::now().timestamp();
        let sub = bootstrap::provider_entry_to_subscription(&entry, now);
        subscription_repo::upsert(rt.pool(), &sub)
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 删除订阅。
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

/// 获取所有订阅（优先从 SQLite，fallback 到 YAML 配置）。
#[tauri::command]
pub async fn get_providers(
    rt: State<'_, RuntimeManager>,
    state: State<'_, AureConfigState>,
) -> Result<Vec<crate::models::Provider>, String> {
    let rows = subscription_repo::list_all(rt.pool())
        .await
        .map_err(|e| e.to_string())?;
    if !rows.is_empty() {
        return Ok(rows
            .into_iter()
            .map(|s| bootstrap::subscription_to_provider(&s))
            .collect());
    }
    let cfg = state.get();
    Ok(cfg
        .providers
        .iter()
        .map(|entry| crate::models::Provider {
            id: entry.id.clone(),
            name: entry.name.clone(),
            url: entry.url.clone(),
            last_updated: entry.last_updated.clone(),
            node_count: entry.node_count,
            traffic_total_gb: entry.traffic_total_gb,
            traffic_used_gb: entry.traffic_used_gb,
            expires_at: entry.expires_at.clone(),
            auto_update_interval: entry.auto_update_interval,
        })
        .collect())
}

/// 下载订阅：UA 竞速 → 解析 → 入库。
#[tauri::command]
pub async fn download_subscription(
    app: AppHandle,
    rt: State<'_, RuntimeManager>,
    state: State<'_, AureConfigState>,
    provider_id: String,
    url: String,
) -> Result<DownloadResult, String> {
    let t0 = std::time::Instant::now();
    tracing::debug!(provider_id = %provider_id, "[subscription] 开始下载: {}", url);

    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("无法获取应用配置目录: {e}"))?;

    let sub_dir = config_dir.join("subscriptions");
    tokio::fs::create_dir_all(&sub_dir)
        .await
        .map_err(|e| format!("创建订阅目录失败: {e}"))?;

    let fetcher = Fetcher::default();
    let t_fetch = std::time::Instant::now();
    let FetchResult {
        content,
        meta: header_meta,
        debug_headers,
        redirect_count,
    } = fetcher.fetch(&url, &provider_id).await?;
    tracing::debug!(
        provider_id = %provider_id,
        "[subscription] HTTP 下载+校验完成 ({:.0}ms), redirects={}, content_len={}",
        t_fetch.elapsed().as_millis(),
        redirect_count,
        content.len()
    );

    let file_path = sub_dir.join(format!("{}.yaml", provider_id));
    tokio::fs::write(&file_path, &content)
        .await
        .map_err(|e| format!("写入订阅文件失败: {e}"))?;

    let registry = ParserRegistry::default();
    let endpoints = registry.ingest_subscription_bytes(&content, &provider_id);
    if !endpoints.is_empty() {
        ensure_subscription_row(&rt, &*state, &provider_id, &url).await?;
        endpoint_repo::replace_for_source(rt.pool(), &provider_id, &endpoints)
            .await
            .map_err(|e| format!("同步节点到数据库失败: {e}"))?;
    } else {
        tracing::warn!(provider_id = %provider_id, "订阅解析未得到可用节点");
    }

    let node_count_db = endpoint_repo::count_by_source(rt.pool(), &provider_id)
        .await
        .map_err(|e| format!("读取节点数量失败: {e}"))?;

    state.get_mut_and_save(|cfg| {
        if let Some(p) = cfg.providers.iter_mut().find(|p| p.id == provider_id) {
            p.node_count = node_count_db.max(0) as usize;
            if !endpoints.is_empty() {
                p.nodes.clear();
            }
        }
    })?;

    let meta = header_meta.or_else(|| parse_yaml_meta(&content));

    if let Some(ref meta) = meta {
        let traffic_total = meta.total_bytes.map(|b| crate::commands::bytes_to_gb(b as i64));
        let traffic_used = match (meta.upload_bytes, meta.download_bytes) {
            (Some(up), Some(down)) => Some(crate::commands::bytes_to_gb((up + down) as i64)),
            _ => None,
        };
        let expires_at = meta.expire_timestamp.map(|ts| {
            chrono::DateTime::from_timestamp(ts as i64, 0)
                .unwrap_or_default()
                .to_rfc3339()
        });

        state.get_mut_and_save(|cfg| {
            if let Some(provider) = cfg.providers.iter_mut().find(|p| p.id == provider_id) {
                provider.last_updated = chrono::Utc::now().to_rfc3339();
                provider.traffic_total_gb = traffic_total;
                provider.traffic_used_gb = traffic_used;
                provider.expires_at = expires_at;
            }
        })?;
    } else {
        state.get_mut_and_save(|cfg| {
            if let Some(provider) = cfg.providers.iter_mut().find(|p| p.id == provider_id) {
                provider.last_updated = chrono::Utc::now().to_rfc3339();
            }
        })?;
    }

    let snapshot = state
        .get()
        .providers
        .iter()
        .find(|p| p.id == provider_id)
        .cloned();
    let base_entry = snapshot.unwrap_or_else(|| stub_provider_entry(&provider_id, &url));
    let now_ts = chrono::Utc::now().timestamp();
    let mut sub_row = bootstrap::provider_entry_to_subscription(&base_entry, now_ts);
    sub_row.node_count = node_count_db;
    subscription_repo::upsert(rt.pool(), &sub_row)
        .await
        .map_err(|e| format!("更新订阅记录失败: {e}"))?;

    tracing::debug!(
        provider_id = %provider_id,
        "[subscription] 下载流程完成，总耗时 {:.0}ms",
        t0.elapsed().as_millis()
    );

    Ok(DownloadResult {
        path: file_path.to_string_lossy().to_string(),
        content_length: content.len(),
        meta,
        debug_headers,
    })
}

#[tauri::command]
pub async fn get_subscription_path(
    app: AppHandle,
    provider_id: String,
) -> Result<Option<String>, String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("无法获取应用配置目录: {e}"))?;

    let file_path = config_dir
        .join("subscriptions")
        .join(format!("{}.yaml", provider_id));

    if file_path.exists() {
        Ok(Some(file_path.to_string_lossy().to_string()))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub async fn delete_subscription_file(app: AppHandle, provider_id: String) -> Result<(), String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("无法获取应用配置目录: {e}"))?;

    let file_path = config_dir
        .join("subscriptions")
        .join(format!("{}.yaml", provider_id));

    if file_path.exists() {
        tokio::fs::remove_file(&file_path)
            .await
            .map_err(|e| format!("删除订阅文件失败: {e}"))?;
    }
    Ok(())
}
