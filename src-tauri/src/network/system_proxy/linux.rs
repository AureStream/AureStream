//! Linux 系统代理：支持 GNOME 桌面（gsettings）。
//!
//! 通过 `gsettings` 命令写入 `org.gnome.system.proxy` 配置。
//! 若检测不到 GNOME 环境则静默跳过。

use std::process::Command;

use crate::models::proxy_config::ProxyConfig;

use super::common::{ensure_loopback_bypass, parse_bypass_domains, system_proxy_host};

/// 查找 gsettings 可执行文件路径。
fn find_gsettings() -> Option<&'static str> {
    for candidate in &["/usr/bin/gsettings", "/usr/local/bin/gsettings", "gsettings"] {
        if Command::new(candidate)
            .arg("--version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
        {
            return Some(candidate);
        }
    }
    None
}

/// 检测当前是否为 GNOME 桌面环境。
fn is_gnome() -> bool {
    if let Ok(desktop) = std::env::var("XDG_CURRENT_DESKTOP") {
        let lower = desktop.to_lowercase();
        if lower.contains("gnome") || lower.contains("unity") || lower.contains("budgie") {
            return true;
        }
    }
    if let Ok(session) = std::env::var("GDMSESSION") {
        let lower = session.to_lowercase();
        if lower.contains("gnome") || lower.contains("unity") {
            return true;
        }
    }
    // fallback：检查 gsettings schema 是否存在
    if let Some(gs) = find_gsettings() {
        return Command::new(gs)
            .args(["get", "org.gnome.system.proxy", "mode"])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
    }
    false
}

/// 执行 gsettings set 命令。
fn gsettings_set(schema: &str, key: &str, value: &str) -> Result<(), String> {
    let gs = find_gsettings().ok_or_else(|| "未找到 gsettings 命令".to_string())?;
    let output = Command::new(gs)
        .args(["set", schema, key, value])
        .output()
        .map_err(|e| format!("执行 gsettings 失败: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("gsettings set {schema} {key} 失败: {stderr}"));
    }
    Ok(())
}

/// 构建 GNOME ignore-hosts 列表的 GVariant 格式字符串。
fn build_ignore_hosts(raw: &str) -> String {
    let mut domains = parse_bypass_domains(raw);
    ensure_loopback_bypass(&mut domains);
    // GNOME 期望格式: ['localhost', '127.0.0.0/8', ...]
    let entries: Vec<String> = domains.iter().map(|d| format!("'{}'", d)).collect();
    format!("[{}]", entries.join(", "))
}

pub fn apply(config: &ProxyConfig) -> Result<(), String> {
    if config.mixed_port == 0 {
        return Err("系统代理端口未就绪，请重新连接".to_string());
    }
    if !is_gnome() {
        tracing::info!("[system-proxy] 非 GNOME 环境，跳过 Linux 系统代理设置");
        return Ok(());
    }

    let host = system_proxy_host(&config.listen);
    let port = config.mixed_port.to_string();

    tracing::info!(host = %host, port = %port, "[system-proxy] 设置 GNOME 系统代理");

    gsettings_set("org.gnome.system.proxy", "mode", "manual")?;

    // HTTP 代理
    gsettings_set("org.gnome.system.proxy.http", "host", &host)?;
    gsettings_set("org.gnome.system.proxy.http", "port", &port)?;

    // HTTPS 代理
    gsettings_set("org.gnome.system.proxy.https", "host", &host)?;
    gsettings_set("org.gnome.system.proxy.https", "port", &port)?;

    // SOCKS 代理
    gsettings_set("org.gnome.system.proxy.socks", "host", &host)?;
    gsettings_set("org.gnome.system.proxy.socks", "port", &port)?;

    // 绕过域名
    let ignore = build_ignore_hosts(&config.bypass_domains);
    gsettings_set("org.gnome.system.proxy", "ignore-hosts", &ignore)?;

    Ok(())
}

pub fn clear() -> Result<(), String> {
    if !is_gnome() {
        return Ok(());
    }

    tracing::info!("[system-proxy] 清除 GNOME 系统代理");
    gsettings_set("org.gnome.system.proxy", "mode", "'none'")?;
    Ok(())
}
