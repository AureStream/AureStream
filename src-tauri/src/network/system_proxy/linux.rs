//! Linux 系统代理（暂未实现）。

use crate::models::proxy_config::ProxyConfig;

pub fn apply(_config: &ProxyConfig) -> Result<(), String> {
    tracing::warn!("[system-proxy] Linux 系统代理暂未实现");
    Ok(())
}

pub fn clear() -> Result<(), String> {
    Ok(())
}
