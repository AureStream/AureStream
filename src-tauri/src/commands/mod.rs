pub mod builtin_config;
pub mod mihomo_constants;
pub mod mihomo_kernel;
pub mod proxy;

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
            listen: mihomo_constants::DEFAULT_LISTEN_ADDR.to_string(),
            mixed_port: 0,
            bypass_domains: DEFAULT_PROXY_BYPASS_DOMAINS.to_string(),
        }
    }
}

pub(crate) fn allocate_high_random_port() -> Result<u16, String> {
    let listener =
        TcpListener::bind((mihomo_constants::DEFAULT_LISTEN_ADDR, 0)).map_err(|e| format!("分配本地端口失败: {}", e))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("读取本地端口失败: {}", e))?
        .port();
    Ok(port)
}

const GB_BYTES: f64 = 1024.0 * 1024.0 * 1024.0;

pub(crate) fn gb_to_bytes(gb: f64) -> i64 {
    (gb * GB_BYTES) as i64
}

pub(crate) fn bytes_to_gb(b: i64) -> f64 {
    b as f64 / GB_BYTES
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

pub use proxy::ProxyState;
