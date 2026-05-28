//! Subscription config fetcher with optimal-DNS pinning + CDN accelerator
//! fallback. Used by the frontend when importing a subscription URL.

use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr};
use std::time::Instant;

use tauri::AppHandle;
use tauri_plugin_http::reqwest;
use url::Url;

use super::dns::{is_ip_address, resolve_a_record, get_optimal_local_dns_server};
use super::whitelist::{load_whitelist_hashes, KNOWN_HOST_SHA256_LIST};

const ACCELERATE_URL: &str = match option_env!("ACCELERATE_URL") {
    Some(val) => val,
    None => "",
};

pub(crate) fn compute_sha256_hex(s: &str) -> String {
    use sha2::{Digest, Sha256};
    let hash = Sha256::digest(s.as_bytes());
    hash.iter().map(|b| format!("{:02x}", b)).collect()
}

fn hostname_suffix_candidates(hostname: &str) -> Vec<String> {
    if hostname.is_empty() {
        return Vec::new();
    }
    let parts: Vec<&str> = hostname.split('.').collect();
    (0..parts.len())
        .rev()
        .map(|i| parts[i..].join("."))
        .collect()
}

pub(crate) fn verify_hostname(hostname: &str, app: &AppHandle) -> bool {
    let cached = load_whitelist_hashes(app);
    for candidate in hostname_suffix_candidates(hostname) {
        let h = compute_sha256_hex(&candidate);
        if KNOWN_HOST_SHA256_LIST.contains(&h.as_str()) || cached.iter().any(|c| c == &h) {
            return true;
        }
    }
    false
}

#[tauri::command]
pub async fn verify_deep_link_url(app: AppHandle, url: String) -> bool {
    let Ok(parsed) = Url::parse(&url) else {
        log::warn!("[deep-link] verify: URL parse failed");
        return false;
    };
    let Some(host) = parsed.host_str() else {
        log::warn!("[deep-link] verify: missing host");
        return false;
    };
    let verified = verify_hostname(host, &app);
    if !verified {
        log::warn!("[deep-link] verify: hostname not on allowlist, apply=1 will be downgraded");
    }
    verified
}

async fn check_accelerator_tcp() -> bool {
    if ACCELERATE_URL.is_empty() {
        return false;
    }
    let Ok(parsed) = Url::parse(ACCELERATE_URL) else {
        return false;
    };
    let Some(host) = parsed.host_str() else {
        return false;
    };
    let addr = format!("{}:443", host);
    matches!(
        tokio::time::timeout(
            std::time::Duration::from_secs(5),
            tokio::net::TcpStream::connect(&addr),
        )
        .await,
        Ok(Ok(_))
    )
}

fn build_accelerated_url(original_url: &str, domain_sha256: &str) -> Option<String> {
    if ACCELERATE_URL.is_empty() {
        return None;
    }
    let parsed = Url::parse(original_url).ok()?;
    let path = parsed.path().to_string();
    let query_part = parsed
        .query()
        .map(|q| format!("?{}", q))
        .unwrap_or_default();
    let base = ACCELERATE_URL.trim_end_matches('/');
    Some(format!("{}/{}{}{}", base, domain_sha256, path, query_part))
}

fn collect_headers(headers: &reqwest::header::HeaderMap) -> HashMap<String, String> {
    headers
        .iter()
        .filter_map(|(name, value)| {
            value
                .to_str()
                .ok()
                .map(|v| (name.to_string(), v.to_string()))
        })
        .collect()
}

#[derive(serde::Serialize)]
pub struct FetchConfigResponse {
    data: Option<serde_json::Value>,
    headers: HashMap<String, String>,
    status: u16,
}

#[tauri::command]
pub async fn fetch_config_with_optimal_dns(
    app: AppHandle,
    url: String,
    user_agent: String,
) -> Result<FetchConfigResponse, String> {
    let t_total = Instant::now();

    let parsed_url = Url::parse(&url).map_err(|e| e.to_string())?;
    let hostname = parsed_url
        .host_str()
        .ok_or("missing host in URL")?
        .to_string();
    let port = parsed_url.port_or_known_default().unwrap_or(443);

    log::info!(
        "[CONFIG_LOAD] 开始请求 URL={} host={} port={}",
        url,
        hostname,
        port
    );

    let domain_sha256 = compute_sha256_hex(&hostname);
    let domain_verified = verify_hostname(&hostname, &app);
    if !domain_verified {
        log::warn!(
            "[CONFIG_LOAD] 方式=VERIFICATION_FAILED, 域名={}, 域名SHA256={}, 加速地址已禁用",
            hostname,
            domain_sha256
        );
    }

    let t_dns_probe = Instant::now();
    let dns_server = match get_optimal_local_dns_server(app.clone()).await {
        Some(d) => d,
        None => "223.5.5.5".to_string(),
    };
    log::info!(
        "[CONFIG_LOAD] DNS服务器选择 server={} elapsed={}ms",
        dns_server,
        t_dns_probe.elapsed().as_millis()
    );

    let client_builder = reqwest::ClientBuilder::new()
        .timeout(std::time::Duration::from_secs(30))
        .no_proxy();

    let t_resolve = Instant::now();
    let primary_client = if !is_ip_address(&hostname) {
        match resolve_a_record(&hostname, &dns_server).await {
            Some(ip) => {
                let addr = SocketAddr::new(IpAddr::V4(ip), port);
                log::info!(
                    "[CONFIG_LOAD] A记录解析成功 {} -> {} via DNS {} elapsed={}ms",
                    hostname,
                    ip,
                    dns_server,
                    t_resolve.elapsed().as_millis()
                );
                client_builder
                    .resolve(&hostname, addr)
                    .build()
                    .map_err(|e| e.to_string())?
            }
            None => {
                log::warn!(
                    "[CONFIG_LOAD] A记录解析失败 {} via {} elapsed={}ms, 回退系统DNS",
                    hostname,
                    dns_server,
                    t_resolve.elapsed().as_millis()
                );
                client_builder.build().map_err(|e| e.to_string())?
            }
        }
    } else {
        client_builder.build().map_err(|e| e.to_string())?
    };

    let t_primary = Instant::now();
    match primary_client
        .get(&url)
        .header("User-Agent", &user_agent)
        .send()
        .await
    {
        Ok(response) => {
            let t_headers = t_primary.elapsed();
            let status = response.status().as_u16();
            let headers = collect_headers(response.headers());
            let t_body = Instant::now();
            let data = if status == 200 {
                response
                    .bytes()
                    .await
                    .ok()
                    .and_then(|b| serde_json::from_slice(&b).ok())
            } else {
                None
            };
            log::info!(
                "[CONFIG_LOAD] 方式=PRIMARY status={} headers_elapsed={}ms body_elapsed={}ms total_elapsed={}ms URL={}",
                status,
                t_headers.as_millis(),
                t_body.elapsed().as_millis(),
                t_total.elapsed().as_millis(),
                url
            );
            Ok(FetchConfigResponse {
                data,
                headers,
                status,
            })
        }
        Err(primary_err) if primary_err.is_connect() || primary_err.is_timeout() => {
            let primary_elapsed = t_primary.elapsed().as_millis();
            let primary_reason = if primary_err.is_timeout() {
                "TIMEOUT".to_string()
            } else {
                format!("CONNECT_ERROR({})", primary_err)
            };
            log::warn!(
                "[CONFIG_LOAD] 主地址失败 reason={} primary_elapsed={}ms URL={}",
                primary_reason,
                primary_elapsed,
                url
            );

            if ACCELERATE_URL.is_empty() {
                log::warn!(
                    "[CONFIG_LOAD] 方式=ACCELERATOR_UNAVAILABLE, 原因=未配置加速地址, 回退中止"
                );
                return Err(format!(
                    "[CONFIG_LOAD] PRIMARY_FAILED: {}, no accelerator configured",
                    primary_reason
                ));
            }

            if !domain_verified {
                log::warn!(
                    "[CONFIG_LOAD] 方式=ACCELERATOR_UNAVAILABLE, 原因=域名未通过验证, 回退中止"
                );
                return Err(format!(
                    "[CONFIG_LOAD] PRIMARY_FAILED: {}, domain not verified, accelerator disabled",
                    primary_reason
                ));
            }

            if !check_accelerator_tcp().await {
                log::warn!("[CONFIG_LOAD] 方式=ACCELERATOR_UNAVAILABLE, 原因=不可达:443, 回退中止");
                return Err(format!(
                    "[CONFIG_LOAD] PRIMARY_FAILED: {}, accelerator unreachable",
                    primary_reason
                ));
            }

            let Some(accelerated_url) = build_accelerated_url(&url, &domain_sha256) else {
                return Err(format!(
                    "[CONFIG_LOAD] PRIMARY_FAILED: {}, cannot build accelerated URL",
                    primary_reason
                ));
            };

            let fallback_client = reqwest::ClientBuilder::new()
                .timeout(std::time::Duration::from_secs(30))
                .no_proxy()
                .build()
                .map_err(|e| e.to_string())?;

            let t_fallback = Instant::now();
            match fallback_client
                .get(&accelerated_url)
                .header("User-Agent", &user_agent)
                .send()
                .await
            {
                Ok(response) => {
                    let t_headers = t_fallback.elapsed();
                    let status = response.status().as_u16();
                    let headers = collect_headers(response.headers());
                    let t_body = Instant::now();
                    if status == 200 {
                        let data = response
                            .bytes()
                            .await
                            .ok()
                            .and_then(|b| serde_json::from_slice(&b).ok());
                        log::info!(
                            "[CONFIG_LOAD] 方式=FALLBACK_ACCELERATOR status={} primary_reason={} headers_elapsed={}ms body_elapsed={}ms total_elapsed={}ms 加速URL={}",
                            status,
                            primary_reason,
                            t_headers.as_millis(),
                            t_body.elapsed().as_millis(),
                            t_total.elapsed().as_millis(),
                            accelerated_url
                        );
                        Ok(FetchConfigResponse {
                            data,
                            headers,
                            status,
                        })
                    } else {
                        log::warn!(
                            "[CONFIG_LOAD] 方式=BOTH_FAILED 主地址原因={} 加速地址原因=HTTP_{} fallback_elapsed={}ms total_elapsed={}ms",
                            primary_reason,
                            status,
                            t_headers.as_millis(),
                            t_total.elapsed().as_millis()
                        );
                        Ok(FetchConfigResponse {
                            data: None,
                            headers,
                            status,
                        })
                    }
                }
                Err(acc_err) => {
                    let acc_reason = if acc_err.is_timeout() {
                        "TIMEOUT".to_string()
                    } else {
                        format!("CONNECT_ERROR({})", acc_err)
                    };
                    log::error!(
                        "[CONFIG_LOAD] 方式=BOTH_FAILED 主地址原因={} 加速地址原因={} fallback_elapsed={}ms total_elapsed={}ms",
                        primary_reason,
                        acc_reason,
                        t_fallback.elapsed().as_millis(),
                        t_total.elapsed().as_millis()
                    );
                    Err(format!(
                        "[CONFIG_LOAD] BOTH_FAILED: primary={}, accelerator={}",
                        primary_reason, acc_reason
                    ))
                }
            }
        }
        Err(e) => Err(e.to_string()),
    }
}
