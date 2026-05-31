use tauri::http::{header::LOCATION, StatusCode};
use tauri::AppHandle;
use tauri_plugin_http::reqwest::{self, redirect::Policy};
use tokio::process::Command;

const DEFAULT_CAPTIVE_URL: &str = "http://captive.oneoh.cloud";

#[allow(dead_code)]
pub(crate) fn is_private_ip(ip: &str) -> bool {
    let parts: Vec<&str> = ip.split('.').collect();
    if parts.len() != 4 {
        return false;
    }

    let octets: Result<Vec<u8>, _> = parts.iter().map(|s| s.parse()).collect();
    if let Ok(octets) = octets {
        if octets[0] == 10 {
            return true;
        }
        if octets[0] == 172 && octets[1] >= 16 && octets[1] <= 31 {
            return true;
        }
        if octets[0] == 192 && octets[1] == 168 {
            return true;
        }
    }
    false
}

pub(crate) fn build_no_redirect_client() -> reqwest::Client {
    reqwest::ClientBuilder::new()
        .timeout(std::time::Duration::from_secs(10))
        .redirect(Policy::none())
        .no_proxy()
        .build()
        .unwrap()
}

#[tauri::command]
pub async fn get_lan_ip() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        use winapi::um::winbase::CREATE_NO_WINDOW;

        let output = Command::new("ipconfig")
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .await
            .map_err(|e| e.to_string())?;

        let output_str = String::from_utf8_lossy(&output.stdout);

        for line in output_str.lines() {
            if line.contains("IPv4")
                && !line.contains("169.254.")
                && !line.contains("100.127.")
            {
                if let Some(ip) = line.split(':').nth(1) {
                    return Ok(ip.trim().to_string());
                }
            }
        }

        Err("unknown".to_string())
    }
    #[cfg(target_os = "linux")]
    {
        let output = Command::new("bash")
            .arg("-c")
            .arg("ip -4 addr show | awk '/inet /{print $2}' | cut -d/ -f1 | grep -v '^127\\.' | head -n 1")
            .output()
            .await
            .map_err(|e| e.to_string())?;
        let ip = String::from_utf8_lossy(&output.stdout);
        Ok(ip.trim().to_string())
    }
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("bash")
            .arg("-c")
            .arg("ifconfig")
            .output()
            .await
            .map_err(|e| e.to_string())?;

        let ifconfig_output = String::from_utf8_lossy(&output.stdout);

        let mut best_ip: Option<String> = None;
        let mut current_interface = String::new();
        let mut is_up = false;
        let mut is_running = false;

        for line in ifconfig_output.lines() {
            if !line.starts_with('\t') && !line.starts_with(' ') && line.contains(':') {
                if let Some(interface) = line.split(':').next() {
                    current_interface = interface.to_string();
                    is_up = line.contains("UP");
                    is_running = line.contains("RUNNING");
                }
            }

            if line.trim().starts_with("inet ") && is_up && is_running {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 2 {
                    let ip = parts[1];

                    if ip.starts_with("127.") {
                        continue;
                    }
                    if ip.starts_with("169.254.") {
                        continue;
                    }

                    if is_private_ip(ip) {
                        if current_interface == "en0" {
                            return Ok(ip.to_string());
                        } else if best_ip.is_none() {
                            best_ip = Some(ip.to_string());
                        }
                    }
                }
            }
        }

        best_ip.ok_or_else(|| "No LAN IP found".to_string())
    }
}

#[tauri::command]
pub async fn open_browser(app: AppHandle, url: String) -> Result<(), String> {
    crate::core::stop(app).await.unwrap_or_else(|e| {
        log::error!("Failed to stop app: {}", e);
    });

    match webbrowser::open(&url) {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Failed to open browser: {}", e)),
    }
}

#[tauri::command]
pub async fn check_captive_portal_status() -> i8 {
    let url = "http://captive.apple.com/";

    let client = build_no_redirect_client();
    match client.get(url).send().await {
        Ok(response) => {
            let status = response.status();
            if status == StatusCode::OK {
                0
            } else if status.is_redirection() {
                1
            } else {
                log::error!("Unexpected status code: {}", status);
                -1
            }
        }
        Err(_) => -1,
    }
}

#[tauri::command]
pub async fn get_captive_redirect_url() -> String {
    let client = build_no_redirect_client();

    match client.get(DEFAULT_CAPTIVE_URL).send().await {
        Ok(response) => {
            let status = response.status();
            if status.is_redirection() {
                response
                    .headers()
                    .get(LOCATION)
                    .and_then(|h| h.to_str().ok())
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| DEFAULT_CAPTIVE_URL.to_string())
            } else {
                log::error!("Unexpected status code: {}", status);
                DEFAULT_CAPTIVE_URL.to_string()
            }
        }
        Err(_) => DEFAULT_CAPTIVE_URL.to_string(),
    }
}

#[tauri::command]
pub async fn ping_google(app: tauri::AppHandle) -> bool {
    let proxy = format!(
        "http://{}:{}",
        "127.0.0.1",
        crate::core::mixed_proxy_port(&app)
    );
    let client = reqwest::ClientBuilder::new()
        .proxy(reqwest::Proxy::all(&proxy).unwrap())
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .unwrap();

    match client
        .get("https://www.google.com/generate_204")
        .send()
        .await
    {
        Ok(res) => res.status().is_success(),
        Err(_) => false,
    }
}

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

#[derive(serde::Serialize, Clone)]
struct TrafficData {
    up: u64,
    down: u64,
}

#[tauri::command]
pub async fn start_traffic_listener(
    app: tauri::AppHandle,
    port: u16,
    secret: String,
) -> Result<(), String> {
    use tauri::Emitter;
    tokio::spawn(async move {
        let client = reqwest::Client::new();
        let url = format!("http://127.0.0.1:{}/traffic", port);
        
        let mut response = match client
            .get(&url)
            .header("Authorization", format!("Bearer {}", secret))
            .send()
            .await
        {
            Ok(res) => res,
            Err(e) => {
                log::error!("Failed to connect to traffic endpoint: {}", e);
                return;
            }
        };

        let mut buffer = String::new();
        while let Ok(Some(chunk)) = response.chunk().await {
            let chunk_str = String::from_utf8_lossy(&chunk);
            buffer.push_str(&chunk_str);
            
            while let Some(pos) = buffer.find('\n') {
                let line = buffer.drain(..=pos).collect::<String>();
                let trimmed = line.trim();
                if !trimmed.is_empty() {
                    if let Ok(data) = serde_json::from_str::<serde_json::Value>(trimmed) {
                        let up = data.get("up").and_then(|v| v.as_u64()).unwrap_or(0);
                        let down = data.get("down").and_then(|v| v.as_u64()).unwrap_or(0);
                        let _ = app.emit("traffic-tick", TrafficData { up, down });
                    }
                }
            }
        }
    });
    Ok(())
}
