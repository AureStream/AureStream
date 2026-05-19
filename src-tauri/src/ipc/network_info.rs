use serde::Serialize;

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

const IP_SB_URL: &str = "https://api.ip.sb/geoip";
const IP_API_URL: &str = "http://ip-api.com/json/?lang=zh-CN";
const TIMEOUT_SECS: u64 = 5;

/// 从 api.ip.sb/geoip 获取网络信息
async fn fetch_from_ip_sb(client: &reqwest::Client) -> Result<NetworkInfo, String> {
    let resp = client
        .get(IP_SB_URL)
        .timeout(std::time::Duration::from_secs(TIMEOUT_SECS))
        .send()
        .await
        .map_err(|e| format!("ip.sb 请求失败: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("ip.sb 返回 HTTP {}", resp.status()));
    }

    let data: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("ip.sb 解析失败: {e}"))?;

    // asn 可能是数字或字符串
    let asn = data["asn"]
        .as_str()
        .map(|s| s.to_string())
        .or_else(|| data["asn"].as_u64().map(|n| format!("AS{n}")))
        .unwrap_or_default();

    let org = data["asn_organization"]
        .as_str()
        .or(data["organization"].as_str())
        .or(data["isp"].as_str())
        .unwrap_or_default()
        .to_string();

    Ok(NetworkInfo {
        ip: data["ip"].as_str().unwrap_or_default().to_string(),
        city: data["city"].as_str().unwrap_or_default().to_string(),
        region: data["region"]
            .as_str()
            .or(data["region_name"].as_str())
            .unwrap_or_default()
            .to_string(),
        country: data["country"].as_str().unwrap_or_default().to_string(),
        asn,
        org,
    })
}

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

/// 获取网络信息：优先 ip.sb，失败则回退 ip-api.com
#[tauri::command]
pub async fn get_network_info() -> Result<NetworkInfo, String> {
    let client = reqwest::Client::new();

    match fetch_from_ip_sb(&client).await {
        Ok(info) => Ok(info),
        Err(e) => {
            tracing::warn!("ip.sb 失败 ({e})，回退到 ip-api.com");
            fetch_from_ip_api(&client).await
        }
    }
}
