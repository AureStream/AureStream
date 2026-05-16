use crate::config::AureConfigState;
use base64::Engine;
use log::{debug, info};
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

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

#[tauri::command]
pub async fn download_subscription(
    app: AppHandle,
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
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(std::time::Duration::from_secs(15))
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    let base_url = reqwest::Url::parse(&url).map_err(|e| format!("Invalid URL: {}", e))?;

    let mut response = client
        .get(url.clone())
        .header("User-Agent", "clash-verge/v2.2.3")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch subscription: {}", e))?;

    // Collect headers from the initial response
    let mut debug_headers: Vec<(String, String)> = response
        .headers()
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("<binary>").to_string()))
        .collect();

    // Parse subscription-userinfo header (might be on the initial response before redirect)
    // Search for any header ending with "subscription-userinfo" (may have prefix like x-amz-meta-)
    let mut header_meta = find_subscription_meta(response.headers());

    // Follow redirects manually (up to 10)
    let mut redirect_count = 0;
    let mut current_url = base_url;
    while response.status().is_redirection() && redirect_count < 10 {
        if let Some(location) = response.headers().get("location") {
            let location_str = location
                .to_str()
                .map_err(|e| format!("Invalid redirect location: {}", e))?;
            // Resolve relative URLs against the current URL
            let resolved = current_url
                .join(location_str)
                .map_err(|e| format!("Failed to resolve redirect URL: {}", e))?;
            info!(
                "[subscription] Redirect {} -> {}",
                response.status(),
                resolved
            );
            response = client
                .get(resolved.clone())
                .header("User-Agent", "clash-verge/v2.2.3")
                .send()
                .await
                .map_err(|e| format!("Failed to follow redirect: {}", e))?;
            current_url = resolved;
            // Collect headers from redirect response too
            for (k, v) in response.headers().iter() {
                let key = k.to_string();
                let val = v.to_str().unwrap_or("<binary>").to_string();
                debug_headers.push((key.clone(), val));
            }
            // Also check for subscription-userinfo on redirect responses
            if header_meta.is_none() {
                header_meta = find_subscription_meta(response.headers());
            }
            redirect_count += 1;
        } else {
            break;
        }
    }

    let raw_content = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    // Try base64 decode; if it fails, use raw content
    let content: Vec<u8> = match try_decode_base64(&raw_content) {
        Some(decoded) => decoded,
        None => raw_content.to_vec(),
    };

    let file_path = sub_dir.join(format!("{}.yaml", provider_id));
    tokio::fs::write(&file_path, &content)
        .await
        .map_err(|e| format!("Failed to write file: {}", e))?;

    // Use header meta, or fall back to parsing YAML content
    let meta = header_meta.or_else(|| parse_yaml_meta(&content));

    debug!("[subscription] URL: {}", url);
    debug!("[subscription] Redirects followed: {}", redirect_count);
    debug!("[subscription] All headers collected:");
    for (k, v) in &debug_headers {
        debug!("[subscription]   {} = {}", k, v);
    }
    debug!("[subscription] header_meta: {:?}", meta);
    debug!("[subscription] content length: {} bytes", content.len());
    if content.len() > 200 {
        debug!(
            "[subscription] content preview: {}",
            String::from_utf8_lossy(&content[..200])
        );
    } else {
        debug!(
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

        info!(
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

    let result = DownloadResult {
        path: file_path.to_string_lossy().to_string(),
        content_length: content.len(),
        meta,
        debug_headers,
    };
    info!(
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
