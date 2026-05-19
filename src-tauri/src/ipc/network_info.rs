use serde::Serialize;
use tauri::State;

use crate::adapter::mihomo::constants::DEFAULT_LISTEN_ADDR;
use crate::models::proxy_config::ProxyState;

/// 网络信息（前端 camelCase 序列化）
#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct NetworkInfo {
    pub ip: String,
    pub city: String,
    pub region: String,
    pub country: String,
    pub asn: String,
    pub org: String,
}

const IP_API_URL: &str = "http://ip-api.com/json/?lang=zh-CN";
const TIMEOUT_SECS: u64 = 5;

/// 从 ip-api.com 获取网络信息
async fn fetch_from_ip_api(client: &reqwest::Client) -> Result<NetworkInfo, String> {
    let resp = client
        .get(IP_API_URL)
        .timeout(std::time::Duration::from_secs(TIMEOUT_SECS))
        .send()
        .await
        .map_err(|e| format!("ip-api.com 请求失败: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("ip-api.com 返回 HTTP {}", resp.status()));
    }

    let data: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("ip-api.com 解析失败: {e}"))?;

    // ip-api.com 的 as 字段格式为 "AS12345 Organization Name"
    let as_str = data["as"].as_str().unwrap_or_default();
    let (asn, org_from_as) = if let Some(pos) = as_str.find(' ') {
        (&as_str[..pos], &as_str[pos + 1..])
    } else {
        (as_str, "")
    };

    let org = data["isp"]
        .as_str()
        .or(data["org"].as_str())
        .unwrap_or(org_from_as);

    Ok(NetworkInfo {
        ip: data["query"].as_str().unwrap_or_default().to_string(),
        city: data["city"].as_str().unwrap_or_default().to_string(),
        region: data["regionName"].as_str().unwrap_or_default().to_string(),
        country: data["country"].as_str().unwrap_or_default().to_string(),
        asn: asn.to_string(),
        org: org.to_string(),
    })
}

/// 获取网络信息：代理连接时走代理网络，否则直连。
#[tauri::command]
pub async fn get_network_info(
    proxy_state: State<'_, ProxyState>,
) -> Result<NetworkInfo, String> {
    let (is_running, mixed_port) = {
        let status = proxy_state.status.lock().map_err(|e| e.to_string())?;
        let config = proxy_state.config.lock().map_err(|e| e.to_string())?;
        (status.is_running, config.mixed_port)
    };

    let mut client_builder = reqwest::Client::builder();

    if is_running && mixed_port > 0 {
        let proxy_url = format!("http://{}:{}", DEFAULT_LISTEN_ADDR, mixed_port);
        let proxy = reqwest::Proxy::all(&proxy_url)
            .map_err(|e| format!("配置代理失败: {}", e))?;
        client_builder = client_builder.proxy(proxy);
    }

    let client = client_builder
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let info = fetch_from_ip_api(&client).await?;
    tracing::info!(
        "网络信息获取成功 (ip-api.com, connected={}): ip={}, country={}",
        is_running,
        info.ip,
        info.country
    );
    Ok(info)
}
