use crate::bootstrap;
use crate::config::{AureConfigState, ProviderEntry};
use crate::runtime::RuntimeManager;
use crate::storage::{endpoint_repo, subscription_repo};
use crate::subscription::ParserRegistry;
use base64::Engine;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Manager, State};
use tokio::task::JoinSet;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionMeta {
    pub upload_bytes: Option<u64>,
    pub download_bytes: Option<u64>,
    pub total_bytes: Option<u64>,
    pub expire_timestamp: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadResult {
    pub path: String,
    pub content_length: usize,
    pub meta: Option<SubscriptionMeta>,
    /// Debug: all response headers as key-value pairs
    pub debug_headers: Vec<(String, String)>,
}

/// Parse a value from a semicolon-delimited header string like "upload=123; download=456"
fn parse_str_value(header_value: &str, key: &str) -> Option<u64> {
    for part in header_value.split(';') {
        let part = part.trim();
        if let Some((k, v)) = part.split_once('=') {
            if k.trim() == key {
                return v.trim().parse().ok();
            }
        }
    }
    None
}

/// Find subscription-userinfo header (may have prefix like x-amz-meta-subscription-userinfo)
fn find_subscription_meta(headers: &reqwest::header::HeaderMap) -> Option<SubscriptionMeta> {
    for (k, v) in headers.iter() {
        let key_lower = k.as_str().to_ascii_lowercase();
        if key_lower
            .strip_suffix("subscription-userinfo")
            .is_some_and(|prefix| prefix.is_empty() || prefix.ends_with('-'))
        {
            return v.to_str().ok().map(parse_subscription_info);
        }
    }
    None
}

fn parse_subscription_info(header_value: &str) -> SubscriptionMeta {
    SubscriptionMeta {
        upload_bytes: parse_str_value(header_value, "upload"),
        download_bytes: parse_str_value(header_value, "download"),
        total_bytes: parse_str_value(header_value, "total"),
        expire_timestamp: parse_str_value(header_value, "expire"),
    }
}

fn parse_yaml_meta(content: &[u8]) -> Option<SubscriptionMeta> {
    let text = std::str::from_utf8(content).ok()?;
    let doc: serde_yaml::Value = serde_yaml::from_str(text).ok()?;
    let map = doc.as_mapping()?;

    let get_u64 = |key: &str| -> Option<u64> {
        map.get(&serde_yaml::Value::String(key.to_string()))
            .and_then(|v| {
                if let Some(n) = v.as_u64() {
                    Some(n)
                } else if let Some(s) = v.as_str() {
                    s.parse().ok()
                } else {
                    None
                }
            })
    };

    let upload = get_u64("upload");
    let download = get_u64("download");
    let total = get_u64("total");
    let expire = get_u64("expire");

    if upload.is_none() && download.is_none() && total.is_none() && expire.is_none() {
        return None;
    }

    Some(SubscriptionMeta {
        upload_bytes: upload,
        download_bytes: download,
        total_bytes: total,
        expire_timestamp: expire,
    })
}

/// Try to decode base64 content. Returns decoded bytes if successful and the
/// result is valid UTF-8, otherwise returns None.
fn try_decode_base64(content: &[u8]) -> Option<Vec<u8>> {
    // Only attempt base64 if the content looks like base64 (ASCII, no YAML markers)
    let text = std::str::from_utf8(content).ok()?;
    let trimmed = text.trim();
    // Skip if it looks like plain YAML
    if trimmed.starts_with('{') || trimmed.starts_with('-') || trimmed.contains(':') {
        return None;
    }
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(trimmed)
        .ok()?;
    // Verify the decoded content is valid UTF-8
    std::str::from_utf8(&decoded).ok()?;
    Some(decoded)
}

/// 网关错误时常因 UA 而异；把你这边「verge 500 / Meta 成功」的场景前置 Meta，减少一次无效往返。
const SUBSCRIPTION_USER_AGENTS: &[&str] = &[
    "ClashMetaForAndroid/2.10.1.meta",
    "clash-verge/v2.2.3",
    "FlClash/v0.8.0",
    "clash",
];

/// 单次 UA 尝试上限（与 reqwest 整体超时一致，便于并行竞速时快速失败）。
const SUBSCRIPTION_FETCH_ATTEMPT_SECS: u64 = 10;

/// 进程内记住「provider -> 上次成功的 UA」，避免下次盲 parallel。
static LAST_SUCCESS_UA_BY_PROVIDER: LazyLock<Mutex<HashMap<String, String>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn remember_subscription_ua(provider_id: &str, ua: &str) {
    if let Ok(mut g) = LAST_SUCCESS_UA_BY_PROVIDER.lock() {
        g.insert(provider_id.to_string(), ua.to_string());
    }
}

fn remembered_ua_for_provider(provider_id: &str) -> Option<String> {
    let g = LAST_SUCCESS_UA_BY_PROVIDER.lock().ok()?;
    g.get(provider_id).cloned()
}

/// 限制单条失败详情长度，避免 HTML 错误页撑爆前端 Toast。
const SUBSCRIPTION_ERR_DETAIL_MAX: usize = 280;

fn truncate_err_detail(s: &str) -> String {
    let t = s.trim().replace('\r', " ").replace('\n', " ");
    if t.chars().count() <= SUBSCRIPTION_ERR_DETAIL_MAX {
        t
    } else {
        let mut out = String::new();
        for ch in t.chars().take(SUBSCRIPTION_ERR_DETAIL_MAX) {
            out.push(ch);
        }
        out.push('…');
        out
    }
}

fn push_attempt_failure(failures: &mut Vec<String>, ua_label: &str, detail: &str) {
    failures.push(format!(
        "• {} {}",
        ua_label,
        truncate_err_detail(detail)
    ));
}

/// 上次成功的 UA 优先，其后为内置列表；按 `as_str()` 去重。
fn subscription_ua_attempt_list(provider_id: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    if let Some(pref) = remembered_ua_for_provider(provider_id) {
        out.push(pref);
    }
    for &ua in SUBSCRIPTION_USER_AGENTS {
        if !out.iter().any(|s| s.as_str() == ua) {
            out.push(ua.to_string());
        }
    }
    out
}

fn ua_failure_label(provider_id: &str, ua: &str) -> String {
    if remembered_ua_for_provider(provider_id).as_deref() == Some(ua) {
        format!("沿用上次成功 UA「{ua}」")
    } else {
        format!("UA「{ua}」")
    }
}

/// 并行竞速多种 User-Agent，首个校验通过者胜出；`Ok` 末元为获胜 UA。
async fn race_user_agents(
    client: &reqwest::Client,
    base_url: &reqwest::Url,
    provider_id: &str,
) -> Result<
    (
        Vec<u8>,
        Vec<(String, String)>,
        Option<SubscriptionMeta>,
        u32,
        String,
    ),
    Vec<String>,
> {
    let attempts = subscription_ua_attempt_list(provider_id);
    if attempts.is_empty() {
        return Err(vec!["未配置任何 User-Agent 候选（请联系开发者）".to_string()]);
    }

    let mut failures: Vec<String> = Vec::new();
    let mut set = JoinSet::new();

    for ua in attempts {
        let client = client.clone();
        let url = base_url.clone();
        set.spawn(async move {
            let attempt = tokio::time::timeout(
                Duration::from_secs(SUBSCRIPTION_FETCH_ATTEMPT_SECS),
                fetch_validated_subscription(&client, &url, &ua),
            )
            .await;
            (ua, attempt)
        });
    }

    let mut downloaded: Option<(Vec<u8>, Vec<(String, String)>, Option<SubscriptionMeta>, u32)> =
        None;
    let mut winning_ua: Option<String> = None;

    while let Some(joined) = set.join_next().await {
        match joined {
            Ok((ua, attempt)) => match attempt {
                Err(_) => {
                    let label = ua_failure_label(provider_id, &ua);
                    push_attempt_failure(
                        &mut failures,
                        &label,
                        &format!(
                            "{SUBSCRIPTION_FETCH_ATTEMPT_SECS}s 内未完成（连接或读取过慢）"
                        ),
                    );
                    tracing::warn!(
                        "[subscription] {} 在 {}s 内未完成",
                        label,
                        SUBSCRIPTION_FETCH_ATTEMPT_SECS
                    );
                }
                Ok(Ok((content, dbg, hm, redirects))) => {
                    tracing::info!(
                        "[subscription] 下载成功 ua={} redirects={}",
                        ua,
                        redirects
                    );
                    remember_subscription_ua(provider_id, &ua);
                    downloaded = Some((content, dbg, hm, redirects));
                    winning_ua = Some(ua);
                    set.abort_all();
                    break;
                }
                Ok(Err(e)) => {
                    let label = ua_failure_label(provider_id, &ua);
                    push_attempt_failure(&mut failures, &label, &e);
                    tracing::warn!("[subscription] {} {}", label, e);
                }
            },
            Err(e) => {
                if e.is_cancelled() {
                    continue;
                }
                push_attempt_failure(&mut failures, "并行任务", &format!("异常: {e}"));
                tracing::warn!("[subscription] 订阅下载任务异常: {e}");
            }
        }
    }

    match (downloaded, winning_ua) {
        (Some((content, dbg, hm, redirects)), Some(ua)) => {
            Ok((content, dbg, hm, redirects, ua))
        }
        _ => Err(failures),
    }
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

/// `endpoints.source_id` 外键指向 `subscriptions.id`，写入节点前必须先有订阅行。
async fn ensure_subscription_row_before_endpoints(
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
        .map_err(|e| format!("写入 subscriptions 失败（节点外键依赖）: {e}"))
}

fn format_all_download_failures(failures: &[String]) -> String {
    const MAX_TOTAL_CHARS: usize = 4500;
    if failures.is_empty() {
        return "订阅下载失败：未能收集到各次尝试的具体错误（请联系开发者或查看日志）。"
            .to_string();
    }
    let header = "订阅下载失败，已尝试多种 User-Agent，原因如下：";
    let body = failures.join("\n");
    let suffix = "\n（详情过长已截断，完整原因见日志。）";
    let combined = format!("{header}\n{body}");
    if combined.len() <= MAX_TOTAL_CHARS {
        return combined;
    }
    let budget = MAX_TOTAL_CHARS.saturating_sub(header.len() + suffix.len());
    let mut end = budget.min(body.len());
    while end > 0 && !body.is_char_boundary(end) {
        end -= 1;
    }
    format!("{header}\n{}…{suffix}", &body[..end])
}

/// 避免把网关错误页写入本地文件：粗略判断是否为代理节点列表。
fn subscription_body_looks_like_proxy_list(content: &[u8]) -> bool {
    let Ok(s) = std::str::from_utf8(content) else {
        return false;
    };
    let t = s.trim_start_matches('\u{feff}').trim_start();
    let lower = t.to_ascii_lowercase();
    if lower.contains("proxies:") || lower.contains("\"proxies\"") {
        return true;
    }
    for line in t.lines().take(800) {
        let x = line.trim_start();
        if x.starts_with("vmess://")
            || x.starts_with("vless://")
            || x.starts_with("trojan://")
            || x.starts_with("ss://")
        {
            return true;
        }
    }
    if t.starts_with("- ")
        && (lower.contains("type:") || lower.contains("\ntype:"))
    {
        return true;
    }
    false
}

async fn fetch_subscription_with_redirects(
    client: &reqwest::Client,
    start_url: &reqwest::Url,
    user_agent: &str,
) -> Result<(reqwest::StatusCode, Vec<u8>, Vec<(String, String)>, Option<SubscriptionMeta>, u32), String>
{
    let mut current_url = start_url.clone();
    let mut response = client
        .get(current_url.clone())
        .header(reqwest::header::USER_AGENT, user_agent)
        .send()
        .await
        .map_err(|e| format!("请求订阅失败: {e}"))?;

    let mut debug_headers: Vec<(String, String)> = response
        .headers()
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("<binary>").to_string()))
        .collect();

    let mut header_meta = find_subscription_meta(response.headers());
    let mut redirect_count = 0u32;

    while response.status().is_redirection() && redirect_count < 10 {
        let Some(location) = response.headers().get(reqwest::header::LOCATION) else {
            break;
        };
        let location_str = location
            .to_str()
            .map_err(|e| format!("无效的跳转 Location: {e}"))?;
        let resolved = current_url
            .join(location_str)
            .map_err(|e| format!("解析跳转 URL 失败: {e}"))?;
        tracing::info!(
            "[subscription] Redirect {} -> {}",
            response.status(),
            resolved
        );
        response = client
            .get(resolved.clone())
            .header(reqwest::header::USER_AGENT, user_agent)
            .send()
            .await
            .map_err(|e| format!("跟随跳转失败: {e}"))?;
        current_url = resolved;
        for (k, v) in response.headers().iter() {
            debug_headers.push((k.to_string(), v.to_str().unwrap_or("<binary>").to_string()));
        }
        if header_meta.is_none() {
            header_meta = find_subscription_meta(response.headers());
        }
        redirect_count += 1;
    }

    let status = response.status();
    if header_meta.is_none() {
        header_meta = find_subscription_meta(response.headers());
    }

    let body = response
        .bytes()
        .await
        .map_err(|e| format!("读取订阅正文失败: {e}"))?
        .to_vec();

    Ok((status, body, debug_headers, header_meta, redirect_count))
}

/// 拉取并校验：HTTP 成功且正文像订阅（避免把错误页写入本地）。
async fn fetch_validated_subscription(
    client: &reqwest::Client,
    base_url: &reqwest::Url,
    ua: &str,
) -> Result<(Vec<u8>, Vec<(String, String)>, Option<SubscriptionMeta>, u32), String> {
    let (status, body, dbg, hm, redirects) =
        fetch_subscription_with_redirects(client, base_url, ua).await?;
    if !status.is_success() {
        let preview = String::from_utf8_lossy(&body[..body.len().min(256)]);
        return Err(format!("HTTP {status}（UA: {ua}）: {}", preview.trim()));
    }
    let content_candidate = try_decode_base64(&body).unwrap_or_else(|| body.clone());
    if !subscription_body_looks_like_proxy_list(&content_candidate) {
        let preview =
            String::from_utf8_lossy(&content_candidate[..content_candidate.len().min(200)]);
        return Err(format!(
            "正文不像订阅配置（UA: {ua}）: {}",
            preview.trim()
        ));
    }
    Ok((content_candidate, dbg, hm, redirects))
}

#[tauri::command]
pub async fn download_subscription(
    app: AppHandle,
    rt: State<'_, RuntimeManager>,
    state: State<'_, AureConfigState>,
    provider_id: String,
    url: String,
) -> Result<DownloadResult, String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to get config dir: {}", e))?;

    let sub_dir = config_dir.join("subscriptions");
    tokio::fs::create_dir_all(&sub_dir)
        .await
        .map_err(|e| format!("Failed to create subscriptions dir: {}", e))?;

    // Build a client that does NOT follow redirects automatically,
    // so we can capture headers (like subscription-userinfo) from the initial response.
    // Bypass system proxy: subscriptions must be fetched directly,
    // otherwise after proxy is connected requests loop through mihomo.
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .no_proxy()
        .connect_timeout(Duration::from_secs(3))
        .timeout(Duration::from_secs(10))
        .gzip(true)
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    let base_url = reqwest::Url::parse(&url).map_err(|e| format!("Invalid URL: {}", e))?;

    let (content, debug_headers, header_meta, redirect_count, _winning_ua) =
        match race_user_agents(&client, &base_url, &provider_id).await {
            Ok(ok) => ok,
            Err(failures) => {
                let msg = format_all_download_failures(&failures);
                tracing::error!(
                    target: "aurestream_lib::commands::subscription",
                    provider_id = %provider_id,
                    url = %url,
                    "\n[subscription] 订阅下载失败汇总：\n{}",
                    msg
                );
                return Err(msg);
            }
        };

    let file_path = sub_dir.join(format!("{}.yaml", provider_id));
    tokio::fs::write(&file_path, &content)
        .await
        .map_err(|e| format!("Failed to write file: {}", e))?;

    let registry = ParserRegistry::default();
    let endpoints = registry.ingest_subscription_bytes(&content, &provider_id);
    if !endpoints.is_empty() {
        ensure_subscription_row_before_endpoints(&rt, &*state, &provider_id, &url).await?;
        endpoint_repo::replace_for_source(rt.pool(), &provider_id, &endpoints)
            .await
            .map_err(|e| format!("同步节点到数据库失败: {e}"))?;
    } else {
        tracing::warn!(
            provider_id = %provider_id,
            "订阅解析未得到可用节点，保留数据库既有节点"
        );
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

    // Use header meta, or fall back to parsing YAML content
    let meta = header_meta.or_else(|| parse_yaml_meta(&content));

    tracing::debug!("[subscription] URL: {}", url);
    tracing::debug!("[subscription] Redirects followed: {}", redirect_count);
    tracing::debug!("[subscription] All headers collected:");
    for (k, v) in &debug_headers {
        tracing::debug!("[subscription]   {} = {}", k, v);
    }
    tracing::debug!("[subscription] header_meta: {:?}", meta);
    tracing::debug!("[subscription] content length: {} bytes", content.len());
    if content.len() > 200 {
        tracing::debug!(
            "[subscription] content preview: {}",
            String::from_utf8_lossy(&content[..200])
        );
    } else {
        tracing::debug!(
            "[subscription] content: {}",
            String::from_utf8_lossy(&content)
        );
    }

    // Update provider metadata in config if we got subscription info
    if let Some(ref meta) = meta {
        let traffic_total = meta
            .total_bytes
            .map(|b| b as f64 / (1024.0 * 1024.0 * 1024.0));
        let traffic_used = match (meta.upload_bytes, meta.download_bytes) {
            (Some(up), Some(down)) => Some((up + down) as f64 / (1024.0 * 1024.0 * 1024.0)),
            _ => None,
        };
        let expires_at = meta.expire_timestamp.map(|ts| {
            let dt = chrono::DateTime::from_timestamp(ts as i64, 0).unwrap_or_default();
            dt.to_rfc3339()
        });

        tracing::info!(
            "[subscription] provider_id={}, traffic_total={:?}, traffic_used={:?}, expires_at={:?}",
            provider_id, traffic_total, traffic_used, expires_at
        );

        state.get_mut_and_save(|cfg| {
            if let Some(provider) = cfg.providers.iter_mut().find(|p| p.id == provider_id) {
                provider.last_updated = chrono::Utc::now().to_rfc3339();
                provider.traffic_total_gb = traffic_total;
                provider.traffic_used_gb = traffic_used;
                provider.expires_at = expires_at;
            }
        })?;
    } else {
        // Just update last_updated even if no metadata
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

    let result = DownloadResult {
        path: file_path.to_string_lossy().to_string(),
        content_length: content.len(),
        meta,
        debug_headers,
    };
    tracing::info!(
        "[subscription] Returning DownloadResult: meta={:?}",
        result.meta
    );
    Ok(result)
}

#[tauri::command]
pub async fn get_subscription_path(
    app: AppHandle,
    provider_id: String,
) -> Result<Option<String>, String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to get config dir: {}", e))?;

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
        .map_err(|e| format!("Failed to get config dir: {}", e))?;

    let file_path = config_dir
        .join("subscriptions")
        .join(format!("{}.yaml", provider_id));

    if file_path.exists() {
        tokio::fs::remove_file(&file_path)
            .await
            .map_err(|e| format!("Failed to delete file: {}", e))?;
    }

    Ok(())
}
