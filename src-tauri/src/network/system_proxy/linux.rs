//! Linux 系统代理：支持 GNOME（gsettings）和 KDE（kioslaverc）桌面环境。
//!
//! 若检测不到支持的桌面环境则静默跳过。

use std::process::Command;

use crate::models::proxy_config::ProxyConfig;

use super::common::{ensure_loopback_bypass, parse_bypass_domains, system_proxy_host};

#[derive(Debug, PartialEq, Eq)]
enum DesktopEnv {
    Gnome, // 包含 GNOME, MATE, Cinnamon, Budgie, XFCE 等使用 gsettings 的环境
    Kde,   // KDE Plasma
    Unknown,
}

/// 检测当前桌面环境
fn detect_desktop() -> DesktopEnv {
    if let Ok(desktop) = std::env::var("XDG_CURRENT_DESKTOP") {
        let lower = desktop.to_lowercase();
        if lower.contains("gnome")
            || lower.contains("unity")
            || lower.contains("budgie")
            || lower.contains("mate")
            || lower.contains("xfce")
        {
            return DesktopEnv::Gnome;
        }
        if lower.contains("kde") {
            return DesktopEnv::Kde;
        }
    }
    if let Ok(session) = std::env::var("GDMSESSION") {
        let lower = session.to_lowercase();
        if lower.contains("gnome") || lower.contains("unity") || lower.contains("mate") {
            return DesktopEnv::Gnome;
        }
        if lower.contains("kde") {
            return DesktopEnv::Kde;
        }
    }

    // Fallback 探测
    if find_gsettings().is_some() {
        return DesktopEnv::Gnome;
    }
    if find_kwriteconfig().is_some() {
        return DesktopEnv::Kde;
    }

    DesktopEnv::Unknown
}

// ==================== GNOME / GSettings 实现 ====================

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
fn build_gnome_ignore_hosts(raw: &str) -> String {
    let mut domains = parse_bypass_domains(raw);
    ensure_loopback_bypass(&mut domains);
    let entries: Vec<String> = domains.iter().map(|d| format!("'{}'", d)).collect();
    format!("[{}]", entries.join(", "))
}

fn apply_gnome(host: &str, port: &str, bypass_domains: &str) -> Result<(), String> {
    gsettings_set("org.gnome.system.proxy", "mode", "manual")?;

    gsettings_set("org.gnome.system.proxy.http", "host", host)?;
    gsettings_set("org.gnome.system.proxy.http", "port", port)?;

    gsettings_set("org.gnome.system.proxy.https", "host", host)?;
    gsettings_set("org.gnome.system.proxy.https", "port", port)?;

    gsettings_set("org.gnome.system.proxy.socks", "host", host)?;
    gsettings_set("org.gnome.system.proxy.socks", "port", port)?;

    let ignore = build_gnome_ignore_hosts(bypass_domains);
    gsettings_set("org.gnome.system.proxy", "ignore-hosts", &ignore)?;
    Ok(())
}

fn clear_gnome() -> Result<(), String> {
    gsettings_set("org.gnome.system.proxy", "mode", "'none'")
}

// ==================== KDE / kioslaverc 实现 ====================

/// 查找 KDE 配置写入工具（兼容 Plasma 5 和 6）。
fn find_kwriteconfig() -> Option<&'static str> {
    for candidate in &["kwriteconfig6", "kwriteconfig5"] {
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

/// 通知 KDE 重新加载代理配置。
fn notify_kde_reload() {
    // 广播 DBus 信号通知 KIO 刷新配置
    let _ = Command::new("dbus-send")
        .args([
            "--type=signal",
            "/KIO/Scheduler",
            "org.kde.KIO.Scheduler.reparseConfiguration",
            "string:\"\"",
        ])
        .output();
}

fn apply_kde(host: &str, port: &str, bypass_domains: &str) -> Result<(), String> {
    let kwc = find_kwriteconfig().ok_or_else(|| "未找到 kwriteconfig5/6 工具".to_string())?;

    let run_kwc = |key: &str, val: &str| -> Result<(), String> {
        let status = Command::new(kwc)
            .args(["--file", "kioslaverc", "--group", "Proxy Settings", "--key", key, val])
            .status()
            .map_err(|e| format!("写入 KDE 配置失败: {e}"))?;
        if !status.success() {
            return Err(format!("KDE 写入键值失败: {key}={val}"));
        }
        Ok(())
    };

    let mut domains = parse_bypass_domains(bypass_domains);
    ensure_loopback_bypass(&mut domains);
    let no_proxy = domains.join(",");

    // ProxyType 1 表示手动代理设置 (0: 无代理, 1: 手动, 2: PAC, 3: 自动检测, 4: 系统变量)
    run_kwc("ProxyType", "1")?;
    run_kwc("httpProxy", &format!("http://{host}:{port}"))?;
    run_kwc("httpsProxy", &format!("http://{host}:{port}"))?;
    run_kwc("socksProxy", &format!("socks://{host}:{port}"))?;
    run_kwc("NoProxyFor", &no_proxy)?;

    notify_kde_reload();
    Ok(())
}

fn clear_kde() -> Result<(), String> {
    let kwc = find_kwriteconfig().ok_or_else(|| "未找到 kwriteconfig5/6 工具".to_string())?;

    // 将代理模式改回 0 (无代理)
    let status = Command::new(kwc)
        .args(["--file", "kioslaverc", "--group", "Proxy Settings", "--key", "ProxyType", "0"])
        .status()
        .map_err(|e| format!("清除 KDE 代理配置失败: {e}"))?;

    if status.success() {
        notify_kde_reload();
        Ok(())
    } else {
        Err("重置 KDE ProxyType 失败".to_string())
    }
}

// ==================== 统一公开接口 ====================

pub fn apply(config: &ProxyConfig) -> Result<(), String> {
    if config.mixed_port == 0 {
        return Err("系统代理端口未就绪，请重新连接".to_string());
    }

    let env = detect_desktop();
    if env == DesktopEnv::Unknown {
        tracing::info!("[system-proxy] 未检测到支持的 Linux 桌面环境，跳过系统代理设置");
        return Ok(());
    }

    let host = system_proxy_host(&config.listen);
    let port = config.mixed_port.to_string();

    tracing::info!(env = ?env, host = %host, port = %port, "[system-proxy] 正在设置 Linux 系统代理");

    match env {
        DesktopEnv::Gnome => apply_gnome(&host, &port, &config.bypass_domains)?,
        DesktopEnv::Kde => apply_kde(&host, &port, &config.bypass_domains)?,
        DesktopEnv::Unknown => unreachable!(),
    }

    Ok(())
}

pub fn clear() -> Result<(), String> {
    let env = detect_desktop();
    if env == DesktopEnv::Unknown {
        return Ok(());
    }

    tracing::info!(env = ?env, "[system-proxy] 正在清除 Linux 系统代理");

    match env {
        DesktopEnv::Gnome => clear_gnome()?,
        DesktopEnv::Kde => clear_kde()?,
        DesktopEnv::Unknown => unreachable!(),
    }

    Ok(())
}