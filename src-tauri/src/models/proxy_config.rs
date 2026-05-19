//! 代理配置与状态共享类型（从 commands/ 迁移）。

use serde::{Deserialize, Serialize};

use crate::adapter::mihomo::constants::DEFAULT_LISTEN_ADDR;

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
            listen: DEFAULT_LISTEN_ADDR.to_string(),
            mixed_port: 0,
            bypass_domains: DEFAULT_PROXY_BYPASS_DOMAINS.to_string(),
        }
    }
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

const GB_BYTES: f64 = 1024.0 * 1024.0 * 1024.0;

pub fn gb_to_bytes(gb: f64) -> i64 {
    (gb * GB_BYTES) as i64
}

pub fn bytes_to_gb(b: i64) -> f64 {
    b as f64 / GB_BYTES
}

/// 代理运行状态（Mutex 包裹，Tauri State 管理）。
pub struct ProxyState {
    pub config: std::sync::Mutex<ProxyConfig>,
    pub status: std::sync::Mutex<ProxyStatus>,
}

impl Default for ProxyState {
    fn default() -> Self {
        Self {
            config: std::sync::Mutex::new(ProxyConfig::default()),
            status: std::sync::Mutex::new(ProxyStatus::default()),
        }
    }
}
