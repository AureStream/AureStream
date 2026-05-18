//! HTTP 拉取订阅正文：UA 竞速、手动重定向、subscription-userinfo 解析、base64 解码、内容校验。
//!
//! [`Fetcher`] 持有共享 `reqwest::Client`，避免每次请求重建连接池。

use crate::error::AppError;
use base64::Engine;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use std::time::Duration;
use tokio::task::JoinSet;

/// 订阅流量元数据（来自 HTTP header `subscription-userinfo`）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionMeta {
    pub upload_bytes: Option<u64>,
    pub download_bytes: Option<u64>,
    pub total_bytes: Option<u64>,
    pub expire_timestamp: Option<u64>,
}

/// Fetcher 拉取结果。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchResult {
    pub content: Vec<u8>,
    pub meta: Option<SubscriptionMeta>,
    pub debug_headers: Vec<(String, String)>,
    pub redirect_count: u32,
}

/// 订阅 HTTP 拉取器，持有共享连接池 + UA 竞速逻辑。
pub struct Fetcher {
    client: reqwest::Client,
}

/// 网关错误时常因 UA 而异；把你这边「verge 500 / Meta 成功」的场景前置 Meta，减少一次无效往返。
const SUBSCRIPTION_USER_AGENTS: &[&str] = &[
    "ClashMetaForAndroid/2.10.1.meta",
    "clash-verge/v2.2.3",
    "FlClash/v0.8.0",
    "clash",
];

/// 单次 UA 尝试上限（与 reqwest 整体超时一致，便于并行竞速时快速失败）。
const SUBSCRIPTION_FETCH_ATTEMPT_SECS: u64 = 30;

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
    failures.push(format!("• {} {}", ua_label, truncate_err_detail(detail)));
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

fn format_all_download_failures(failures: &[String]) -> String {
    const MAX_TOTAL_CHARS: usize = 4500;
    if failures.is_empty() {
        return "订阅下载失败：未能收集到各次尝试的具体错误（请联系开发者或查看日志）。".to_string();
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

// ─── HTTP Header 解析 ──────────────────────────────────────────────────────

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

/// 从 YAML 内容中解析元数据（fallback 当 header 无 subscription-userinfo 时）。
pub fn parse_yaml_meta(content: &[u8]) -> Option<SubscriptionMeta> {
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

// ─── 内容校验 ─────────────────────────────────────────────────────────────

/// Try to decode base64 content. Returns decoded bytes if successful and the
/// result is valid UTF-8, otherwise returns None.
fn try_decode_base64(content: &[u8]) -> Option<Vec<u8>> {
    let text = std::str::from_utf8(content).ok()?;
    let trimmed = text.trim();
    if trimmed.starts_with('{') || trimmed.starts_with('-') || trimmed.contains(':') {
        return None;
    }
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(trimmed)
        .ok()?;
    std::str::from_utf8(&decoded).ok()?;
    Some(decoded)
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
    if t.starts_with("- ") && (lower.contains("type:") || lower.contains("\ntype:")) {
        return true;
    }
    false
}

// ─── Fetcher 实现 ──────────────────────────────────────────────────────────

impl Fetcher {
    pub fn new() -> Result<Self, AppError> {
        let client = reqwest::Client::builder()
            .no_proxy()
            .gzip(true)
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(30))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(AppError::Http)?;
        Ok(Self { client })
    }

    /// 拉取订阅：UA 竞速 → 手动重定向 → 校验 → 返回内容 + 元数据。
    pub async fn fetch(&self, url: &str, provider_id: &str) -> Result<FetchResult, String> {
        let base_url = reqwest::Url::parse(url).map_err(|e| format!("无效 URL: {e}"))?;
        let (content, debug_headers, meta, redirect_count, _winning_ua) =
            self.race_user_agents(&base_url, provider_id).await
                .map_err(|failures| format_all_download_failures(&failures))?;
        Ok(FetchResult {
            content,
            meta,
            debug_headers,
            redirect_count,
        })
    }

    /// 并行竞速多种 User-Agent，首个校验通过者胜出。
    async fn race_user_agents(
        &self,
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

        let t_race = std::time::Instant::now();
        let mut failures: Vec<String> = Vec::new();
        let mut set = JoinSet::new();

        for ua in attempts {
            let client = self.client.clone();
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
                            &format!("{SUBSCRIPTION_FETCH_ATTEMPT_SECS}s 内未完成（连接或读取过慢）"),
                        );
                    }
                    Ok(Ok((content, dbg, hm, redirects))) => {
                        tracing::info!(
                            "[subscription] 下载成功 ua={} redirects={} ({:.0}ms)",
                            ua,
                            redirects,
                            t_race.elapsed().as_millis()
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
}

impl Default for Fetcher {
    fn default() -> Self {
        Self::new().expect("构建默认 Fetcher 失败")
    }
}

// ─── 内部辅助函数 ──────────────────────────────────────────────────────────

/// 手动跟随重定向（最多 10 次），收集 headers。
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
        let preview = String::from_utf8_lossy(&content_candidate[..content_candidate.len().min(200)]);
        return Err(format!("正文不像订阅配置（UA: {ua}）: {}", preview.trim()));
    }
    Ok((content_candidate, dbg, hm, redirects))
}
