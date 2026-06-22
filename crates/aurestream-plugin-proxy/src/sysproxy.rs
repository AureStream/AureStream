//! Cross-platform system HTTP/SOCKS proxy override helpers.
//!
//! Thin wrappers around `Sysproxy::set_system_proxy()` / `get_system_proxy()`.
//! Callers are responsible for supplying the proxy port and per-platform bypass list.

use crate::Sysproxy;

const PROXY_HOST: &str = "127.0.0.1";

/// Apply the HTTP/SOCKS system proxy pointing at the Mixed inbound port.
pub async fn set_system_proxy(proxy_port: u16, bypass: String) -> anyhow::Result<()> {
    log::info!("Start set system proxy: {}:{}", PROXY_HOST, proxy_port);
    let sys = Sysproxy {
        enable: true,
        host: PROXY_HOST.to_string(),
        port: proxy_port,
        bypass,
    };
    sys.set_system_proxy().map_err(|e| anyhow::anyhow!(e))?;
    log::info!("Proxy set to {}:{}", PROXY_HOST, proxy_port);
    Ok(())
}

/// Clear whatever proxy was set. Reads current proxy state first so any
/// non-enable fields (bypass list) are preserved — only flips `enable` to false.
pub async fn clear_system_proxy() -> anyhow::Result<()> {
    log::info!("Start unset system proxy");
    let mut sysproxy = Sysproxy::get_system_proxy().map_err(|e| {
        let msg = format!("Sysproxy::get_system_proxy failed: {}", e);
        log::error!("{}", msg);
        anyhow::anyhow!(msg)
    })?;
    sysproxy.enable = false;
    sysproxy.set_system_proxy().map_err(|e| {
        let msg = format!("Sysproxy::set_system_proxy failed: {}", e);
        log::error!("{}", msg);
        anyhow::anyhow!(msg)
    })?;
    log::info!("System proxy unset successfully");
    Ok(())
}
