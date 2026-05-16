pub mod builtin_config;
pub mod mihomo_constants;
pub mod mihomo_kernel;
pub mod provider;
pub mod proxy;
pub mod settings;
pub mod subscription;
mod system_proxy;

use serde::{Deserialize, Serialize};
use std::net::TcpListener;

pub const DEFAULT_PROXY_BYPASS_DOMAINS: &str =
    "localhost,127.*,10.*,172.16.*,172.17.*,172.18.*,172.19.*,172.20.*,172.21.*,172.22.*,172.23.*,172.24.*,172.25.*,172.26.*,172.27.*,172.28.*,172.29.*,172.30.*,172.31.*,192.168.*,<local>";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyConfig {
    pub listen: String,
    pub mixed_port: u16,
    pub bypass_domains: String,
}

impl Default for ProxyConfig {
    fn default() -> Self {
        Self {
            listen: "127.0.0.1".to_string(),
            mixed_port: 0,
            bypass_domains: DEFAULT_PROXY_BYPASS_DOMAINS.to_string(),
        }
    }
}

/// 分配一个随机可用端口，用于本地回环监听。
pub(crate) fn allocate_high_random_port() -> Result<u16, String> {
    let listener =
        TcpListener::bind(("127.0.0.1", 0)).map_err(|e| format!("分配本地端口失败: {}", e))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("读取本地端口失败: {}", e))?
        .port();
    Ok(port)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyStatus {
    pub is_running: bool,
    pub current_node: Option<String>,
    pub upload_bytes: u64,
    pub download_bytes: u64,
}

impl Default for ProxyStatus {
    fn default() -> Self {
        Self {
            is_running: false,
            current_node: None,
            upload_bytes: 0,
            download_bytes: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Provider {
    pub id: String,
    pub name: String,
    pub url: String,
    pub last_updated: String,
    pub node_count: usize,
    #[serde(rename = "trafficTotalGB")]
    pub traffic_total_gb: Option<f64>,
    #[serde(rename = "trafficUsedGB")]
    pub traffic_used_gb: Option<f64>,
    pub expires_at: Option<String>,
    pub auto_update_interval: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Node {
    pub id: String,
    pub name: String,
    pub provider_id: String,
    #[serde(alias = "node_type")]
    pub r#type: String,
    pub server: String,
    pub port: u16,
    pub delay: Option<u32>,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LatencyResult {
    pub node_id: String,
    pub delay: Option<u32>,
    pub error: Option<String>,
}
