//! 系统级代理：连接成功后写入 OS 代理设置，断开或退出时尽量关闭。
//!
//! 每个平台有独立模块：`windows.rs`、`macos.rs`、`linux.rs`。

use crate::models::proxy_config::ProxyConfig;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod linux;

/// 通用辅助函数（跨平台共享）。
pub(crate) mod common {
    /// 将 Mihomo 监听地址转换为写入系统代理的主机名（本机回环统一为 127.0.0.1）。
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    pub fn system_proxy_host(bind: &str) -> String {
        match bind {
            "0.0.0.0" | "::" | "[::]" => "127.0.0.1".to_string(),
            other => other.to_string(),
        }
    }

    /// 解析绕过域名列表（通用：逗号/分号/换行分隔）。
    pub fn parse_bypass_domains(raw: &str) -> Vec<String> {
        raw.split([',', ';', '\n', '\r'])
            .map(str::trim)
            .filter(|item| !item.is_empty())
            .map(ToString::to_string)
            .collect()
    }

    /// 本机回环必须绕过系统代理。
    const LOOPBACK_BYPASS: &[&str] = &["localhost", "127.0.0.1", "<local>"];

    pub fn ensure_loopback_bypass(domains: &mut Vec<String>) {
        for entry in LOOPBACK_BYPASS {
            if !domains.iter().any(|d| d == *entry) {
                domains.push(entry.to_string());
            }
        }
    }
}

pub(crate) fn apply_platform(config: &ProxyConfig) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    { return macos::apply(config); }
    #[cfg(target_os = "windows")]
    { return windows::apply(config); }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    { return linux::apply(config); }
}

pub(crate) fn clear_platform() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    { return macos::clear(); }
    #[cfg(target_os = "windows")]
    { return windows::clear(); }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    { return linux::clear(); }
}
