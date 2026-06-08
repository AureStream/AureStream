use tauri_plugin_http::reqwest;

#[tauri::command]
pub async fn ping_tcp(host: String, port: u16) -> Result<u64, String> {
    use std::time::{Duration, Instant};
    use tokio::net::TcpStream;
    use tokio::time::timeout;

    let addr = format!("{}:{}", host, port);
    let start = Instant::now();
    match timeout(Duration::from_millis(3000), TcpStream::connect(&addr)).await {
        Ok(Ok(_)) => {
            let duration = start.elapsed().as_millis() as u64;
            Ok(duration)
        }
        Ok(Err(e)) => Err(e.to_string()),
        Err(_) => Err("Timeout".to_string()),
    }
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct GeoIpInfo {
    pub ip: String,
    #[serde(rename = "countryName")]
    pub country_name: String,
    #[serde(rename = "countryCode")]
    pub country_code: String,
    pub region: String,
    pub isp: String,
}

#[tauri::command]
pub async fn get_geoip_info(app: tauri::AppHandle, use_proxy: bool) -> Result<GeoIpInfo, String> {
    let mut builder = reqwest::ClientBuilder::new().timeout(std::time::Duration::from_secs(5));
    
    if use_proxy {
        let proxy_url = format!(
            "http://127.0.0.1:{}",
            crate::core::ports::mixed_proxy_port(&app)
        );
        if let Ok(proxy) = reqwest::Proxy::all(&proxy_url) {
            builder = builder.proxy(proxy);
        }
    } else {
        builder = builder.no_proxy();
    }

    let client = builder.build().map_err(|e| e.to_string())?;
    
    let url = format!("http://ip-api.com/json?lang=zh-CN&t={}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0));

    match client.get(&url).send().await {
        Ok(res) => {
            if res.status().is_success() {
                if let Ok(body) = res.text().await {
                    if let Ok(data) = serde_json::from_str::<serde_json::Value>(&body) {
                        if data.get("status").and_then(|v| v.as_str()) == Some("success") {
                            let country = data.get("country").and_then(|v| v.as_str()).unwrap_or("未知").to_string();
                            let city = data.get("city").and_then(|v| v.as_str()).unwrap_or("").to_string();
                            let region = if city.is_empty() {
                                country.clone()
                            } else {
                                format!("{} · {}", country, city)
                            };
                            return Ok(GeoIpInfo {
                                ip: data.get("query").and_then(|v| v.as_str()).unwrap_or("未知").to_string(),
                                country_name: country,
                                country_code: data.get("countryCode").and_then(|v| v.as_str()).unwrap_or("UN").to_string(),
                                region,
                                isp: data.get("isp").and_then(|v| v.as_str()).unwrap_or("未知").to_string(),
                            });
                        }
                    }
                }
            }
        }
        Err(e) => {
            log::warn!("ip-api.com failed via proxy={}: {}", use_proxy, e);
        }
    }

    // Try fallback 1: ipapi.co
    let mut builder = reqwest::ClientBuilder::new().timeout(std::time::Duration::from_secs(5));
    if use_proxy {
        let proxy_url = format!(
            "http://127.0.0.1:{}",
            crate::core::ports::mixed_proxy_port(&app)
        );
        if let Ok(proxy) = reqwest::Proxy::all(&proxy_url) {
            builder = builder.proxy(proxy);
        }
    } else {
        builder = builder.no_proxy();
    }
    let client = builder.build().map_err(|e| e.to_string())?;
    let url = format!("https://ipapi.co/json/?t={}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0));

    match client.get(&url).header("user-agent", "Mozilla/5.0").send().await {
        Ok(res) => {
            if res.status().is_success() {
                if let Ok(body) = res.text().await {
                    if let Ok(data) = serde_json::from_str::<serde_json::Value>(&body) {
                        let country = data.get("country_name").and_then(|v| v.as_str()).unwrap_or("未知").to_string();
                        let city = data.get("city").and_then(|v| v.as_str()).unwrap_or("").to_string();
                        let region = if city.is_empty() {
                            country.clone()
                        } else {
                            format!("{} · {}", country, city)
                        };
                        return Ok(GeoIpInfo {
                            ip: data.get("ip").and_then(|v| v.as_str()).unwrap_or("未知").to_string(),
                            country_name: country,
                            country_code: data.get("country_code").and_then(|v| v.as_str()).unwrap_or("UN").to_string(),
                            region,
                            isp: data.get("org").and_then(|v| v.as_str()).unwrap_or("未知").to_string(),
                        });
                    }
                }
            }
        }
        Err(e) => {
            log::warn!("ipapi.co failed via proxy={}: {}", use_proxy, e);
        }
    }

    Err("Failed to query GeoIP info".to_string())
}
