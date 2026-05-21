//! macOS 系统代理：通过 networksetup 配置当前活跃网络服务代理。
//!
//! 支持：
//! - HTTP Proxy
//! - HTTPS Proxy
//! - SOCKS5 Proxy
//! - Proxy Bypass Domains
//!

use std::process::Command;

use tracing::{info, warn};

use crate::models::proxy_config::ProxyConfig;

use super::common::{parse_bypass_domains, system_proxy_host};

/// 本机回环地址必须绕过代理
const LOOPBACK_BYPASS: &[&str] = &[
    "localhost",
    "127.0.0.1",
    "::1",
    "<local>",
];

/// 执行 networksetup 命令
fn run_networksetup(args: &[&str]) -> Result<(), String> {
    let output = Command::new("/usr/sbin/networksetup")
        .args(args)
        .output()
        .map_err(|e| format!("执行 networksetup 失败: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);

        let msg = if !stderr.trim().is_empty() {
            stderr.trim().to_string()
        } else {
            stdout.trim().to_string()
        };

        return Err(format!(
            "networksetup {:?} 失败: {}",
            args,
            msg
        ));
    }

    Ok(())
}

/// 获取当前活跃网络服务
///
/// 例如：
/// - Wi-Fi
/// - Ethernet
fn macos_active_network_services() -> Result<Vec<String>, String> {
    // 获取当前活跃接口
    let nwi_output = Command::new("/usr/sbin/scutil")
        .arg("--nwi")
        .output()
        .map_err(|e| format!("scutil 执行失败: {e}"))?;

    let nwi_stdout = String::from_utf8_lossy(&nwi_output.stdout);

    let mut active_devices = Vec::new();

    for line in nwi_stdout.lines() {
        if line.starts_with("Network interfaces:") {
            for item in line.split_whitespace().skip(2) {
                active_devices.push(item.trim_matches(',').to_string());
            }
        }
    }

    // 映射 device -> service
    let hw_output = Command::new("/usr/sbin/networksetup")
        .arg("-listallhardwareports")
        .output()
        .map_err(|e| format!("读取网络服务失败: {e}"))?;

    let hw_stdout = String::from_utf8_lossy(&hw_output.stdout);

    let mut services = Vec::new();

    let mut current_port = String::new();

    for line in hw_stdout.lines() {
        if let Some(v) = line.strip_prefix("Hardware Port: ") {
            current_port = v.trim().to_string();
        } else if let Some(v) = line.strip_prefix("Device: ") {
            let device = v.trim();

            if active_devices.iter().any(|x| x == device) {
                services.push(current_port.clone());
            }
        }
    }

    services.sort();
    services.dedup();

    // fallback
    if services.is_empty() {
        warn!("[system-proxy] 未检测到活跃网络服务，使用默认服务");

        services.push("Wi-Fi".to_string());
        services.push("Ethernet".to_string());
    }

    Ok(services)
}

/// 合并 bypass domains
fn build_bypass_domains(raw: &str) -> Vec<String> {
    let mut result: Vec<String> = LOOPBACK_BYPASS
        .iter()
        .map(|s| s.to_string())
        .collect();

    for item in parse_bypass_domains(raw) {
        if !result.iter().any(|x| x == &item) {
            result.push(item);
        }
    }

    result
}

/// 设置单个网络服务代理
fn apply_service_proxy(
    service: &str,
    host: &str,
    port: &str,
    bypass: &[String],
) -> Result<(), String> {
    info!(
        "[system-proxy] 正在设置 macOS 网络服务代理: {}",
        service
    );

    // HTTP
    run_networksetup(&[
        "-setwebproxy",
        service,
        host,
        port,
    ])?;

    // HTTPS
    run_networksetup(&[
        "-setsecurewebproxy",
        service,
        host,
        port,
    ])?;

    // SOCKS5
    run_networksetup(&[
        "-setsocksfirewallproxy",
        service,
        host,
        port,
    ])?;

    // bypass domains
    let mut bypass_args: Vec<&str> = vec![
        "-setproxybypassdomains",
        service,
    ];

    for item in bypass {
        bypass_args.push(item.as_str());
    }

    run_networksetup(&bypass_args)?;

    // enable states

    run_networksetup(&[
        "-setwebproxystate",
        service,
        "on",
    ])?;

    run_networksetup(&[
        "-setsecurewebproxystate",
        service,
        "on",
    ])?;

    run_networksetup(&[
        "-setsocksfirewallproxystate",
        service,
        "on",
    ])?;

    Ok(())
}

/// 清除单个网络服务代理
fn clear_service_proxy(service: &str) -> Result<(), String> {
    info!(
        "[system-proxy] 正在清除 macOS 网络服务代理: {}",
        service
    );

    run_networksetup(&[
        "-setwebproxystate",
        service,
        "off",
    ])?;

    run_networksetup(&[
        "-setsecurewebproxystate",
        service,
        "off",
    ])?;

    run_networksetup(&[
        "-setsocksfirewallproxystate",
        service,
        "off",
    ])?;

    Ok(())
}

/// 应用系统代理
pub fn apply(config: &ProxyConfig) -> Result<(), String> {
    if config.mixed_port == 0 {
        return Err("系统代理端口未就绪，请重新连接".to_string());
    }

    let host = system_proxy_host(&config.listen);

    let port = config.mixed_port.to_string();

    let bypass_domains = build_bypass_domains(
        &config.bypass_domains,
    );

    let services = macos_active_network_services()?;

    info!(
        host = %host,
        port = %port,
        services = ?services,
        "[system-proxy] 设置 macOS 系统代理"
    );

    let mut errors = Vec::new();

    for service in services {
        if let Err(e) = apply_service_proxy(
            &service,
            &host,
            &port,
            &bypass_domains,
        ) {
            warn!(
                "[system-proxy] 设置网络服务 {} 失败: {}",
                service,
                e
            );

            errors.push(format!(
                "{}: {}",
                service,
                e
            ));
        }
    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join("\n"))
    }
}

/// 清除系统代理
pub fn clear() -> Result<(), String> {
    let services = macos_active_network_services()?;

    info!(
        services = ?services,
        "[system-proxy] 清除 macOS 系统代理"
    );

    let mut errors = Vec::new();

    for service in services {
        if let Err(e) = clear_service_proxy(&service) {
            warn!(
                "[system-proxy] 清除网络服务 {} 失败: {}",
                service,
                e
            );

            errors.push(format!(
                "{}: {}",
                service,
                e
            ));
        }
    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join("\n"))
    }
}