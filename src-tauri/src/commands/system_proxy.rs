//! 系统级代理：连接成功后写入 OS 代理设置，断开或退出时尽量关闭。
//! macOS：对 `networksetup -listallnetworkservices` 列出的已启用服务调用 `set*proxy`。
//! Windows：写注册表 HKCU\...\Internet Settings 并通知系统刷新。

use crate::commands::ProxyConfig;
#[cfg(target_os = "macos")]
use std::io::{BufRead, BufReader};
#[cfg(target_os = "macos")]
use std::process::{Command, Stdio};

#[cfg(target_os = "macos")]
fn run_networksetup(args: &[&str]) -> Result<(), String> {
    let out = Command::new("/usr/sbin/networksetup")
        .args(args)
        .stderr(Stdio::piped())
        .stdout(Stdio::piped())
        .output()
        .map_err(|e| format!("执行 networksetup 失败: {}", e))?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        let stdout = String::from_utf8_lossy(&out.stdout);
        return Err(format!(
            "networksetup {} 失败: {}",
            args.join(" "),
            if stderr.trim().is_empty() {
                stdout.trim().to_string()
            } else {
                stderr.trim().to_string()
            }
        ));
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn macos_list_network_services() -> Result<Vec<String>, String> {
    let out = Command::new("/usr/sbin/networksetup")
        .arg("-listallnetworkservices")
        .output()
        .map_err(|e| format!("列出网络服务失败: {}", e))?;
    if !out.status.success() {
        return Err(format!(
            "networksetup -listallnetworkservices 失败: {}",
            String::from_utf8_lossy(&out.stderr)
        ));
    }
    let reader = BufReader::new(out.stdout.as_slice());
    let mut services = Vec::new();
    for (i, line) in reader.lines().enumerate() {
        let line = line.map_err(|e| format!("读取 networksetup 输出失败: {}", e))?;
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if i == 0 && line.contains("asterisk") {
            continue;
        }
        if line.starts_with('*') {
            continue;
        }
        if line.ends_with('*') {
            continue;
        }
        services.push(line.to_string());
    }
    if services.is_empty() {
        return Err("未发现可用的网络服务（无法设置系统代理）".to_string());
    }
    Ok(services)
}

#[cfg(target_os = "macos")]
fn apply_macos(config: &ProxyConfig) -> Result<(), String> {
    if config.mixed_port == 0 {
        return Err("系统代理端口未就绪，请重新连接".to_string());
    }
    let host = system_proxy_host(&config.listen);
    let port = config.mixed_port.to_string();
    let bypass_domains = merge_bypass_with_loopback(parse_bypass_domains(&config.bypass_domains));
    let services = macos_list_network_services()?;
    for svc in &services {
        run_networksetup(&["-setwebproxy", svc, &host, &port])?;
        run_networksetup(&["-setsecurewebproxy", svc, &host, &port])?;
        run_networksetup(&["-setsocksfirewallproxy", svc, &host, &port])?;
        let mut args: Vec<&str> = Vec::with_capacity(2 + bypass_domains.len());
        args.push("-setproxybypassdomains");
        args.push(svc.as_str());
        for domain in &bypass_domains {
            args.push(domain.as_str());
        }
        run_networksetup(&args)?;
        run_networksetup(&["-setwebproxystate", svc, "on"])?;
        run_networksetup(&["-setsecurewebproxystate", svc, "on"])?;
        run_networksetup(&["-setsocksfirewallproxystate", svc, "on"])?;
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn clear_macos() -> Result<(), String> {
    let services = macos_list_network_services()?;
    for svc in &services {
        let _ = run_networksetup(&["-setwebproxystate", svc, "off"]);
        let _ = run_networksetup(&["-setsecurewebproxystate", svc, "off"]);
        let _ = run_networksetup(&["-setsocksfirewallproxystate", svc, "off"]);
    }
    Ok(())
}

/// 将 Mihomo 监听地址转换为写入系统代理的主机名（本机回环统一为 127.0.0.1）。
#[cfg(any(target_os = "macos", target_os = "windows"))]
pub(crate) fn system_proxy_host(bind: &str) -> String {
    match bind {
        "0.0.0.0" | "::" | "[::]" => "127.0.0.1".to_string(),
        other => other.to_string(),
    }
}

#[cfg(target_os = "macos")]
fn parse_bypass_domains(raw: &str) -> Vec<String> {
    raw.split([',', ';', '\n', '\r'])
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(ToString::to_string)
        .collect()
}

/// 本机回环必须绕过系统代理，否则流量会同侧经 Mihomo 再 `GEOIP,private,DIRECT` 访问本机，易刷 `localhost:80` 类告警。
#[cfg(target_os = "macos")]
fn merge_bypass_with_loopback(parsed: Vec<String>) -> Vec<String> {
    const ALWAYS: &[&str] = &["localhost", "127.0.0.1", "<local>"];
    let mut out: Vec<String> = ALWAYS.iter().map(|s| (*s).to_string()).collect();
    for item in parsed {
        if !out.iter().any(|x| x == &item) {
            out.push(item);
        }
    }
    out
}

// ---- Windows ----

#[cfg(target_os = "windows")]
fn parse_bypass_domains_windows(raw: &str) -> String {
    let mut domains: Vec<String> = raw
        .split([',', ';', '\n', '\r'])
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(ToString::to_string)
        .collect();
    // 本机回环必须绕过系统代理
    for always in &["localhost", "127.0.0.1", "<local>"] {
        if !domains.iter().any(|d| d == *always) {
            domains.push(always.to_string());
        }
    }
    domains.join(";")
}

/// 通知 Windows 系统代理设置已变更，让浏览器等应用立即生效。
#[cfg(target_os = "windows")]
fn notify_internet_settings_changed() {
    #[link(name = "wininet")]
    extern "system" {
        fn InternetSetOptionW(
            hinternet: *mut core::ffi::c_void,
            dwoption: u32,
            lpbuffer: *mut core::ffi::c_void,
            dwbufferlength: u32,
        ) -> i32;
    }
    const INTERNET_OPTION_SETTINGS_CHANGED: u32 = 39;
    const INTERNET_OPTION_REFRESH: u32 = 37;
    unsafe {
        InternetSetOptionW(
            std::ptr::null_mut(),
            INTERNET_OPTION_SETTINGS_CHANGED,
            std::ptr::null_mut(),
            0,
        );
        InternetSetOptionW(
            std::ptr::null_mut(),
            INTERNET_OPTION_REFRESH,
            std::ptr::null_mut(),
            0,
        );
    }
}

#[cfg(target_os = "windows")]
fn apply_windows(config: &ProxyConfig) -> Result<(), String> {
    if config.mixed_port == 0 {
        return Err("系统代理端口未就绪，请重新连接".to_string());
    }
    let host = system_proxy_host(&config.listen);
    let proxy_server = format!("{}:{}", host, config.mixed_port);
    let bypass = parse_bypass_domains_windows(&config.bypass_domains);

    use winreg::enums::*;
    use winreg::RegKey;
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let internet_settings = hkcu
        .open_subkey_with_flags(
            "Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
            KEY_READ | KEY_WRITE,
        )
        .map_err(|e| format!("打开注册表失败: {}", e))?;

    internet_settings
        .set_value("ProxyEnable", &1u32)
        .map_err(|e| format!("设置 ProxyEnable 失败: {}", e))?;
    internet_settings
        .set_value("ProxyServer", &proxy_server)
        .map_err(|e| format!("设置 ProxyServer 失败: {}", e))?;
    internet_settings
        .set_value("ProxyOverride", &bypass)
        .map_err(|e| format!("设置 ProxyOverride 失败: {}", e))?;

    notify_internet_settings_changed();
    Ok(())
}

#[cfg(target_os = "windows")]
fn clear_windows() -> Result<(), String> {
    use winreg::enums::*;
    use winreg::RegKey;
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let internet_settings = hkcu
        .open_subkey_with_flags(
            "Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
            KEY_READ | KEY_WRITE,
        )
        .map_err(|e| format!("打开注册表失败: {}", e))?;

    internet_settings
        .set_value("ProxyEnable", &0u32)
        .map_err(|e| format!("清除 ProxyEnable 失败: {}", e))?;

    notify_internet_settings_changed();
    Ok(())
}

// ---- Platform dispatch ----

pub(crate) fn apply_platform(config: &ProxyConfig) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        return apply_macos(config);
    }
    #[cfg(target_os = "windows")]
    {
        return apply_windows(config);
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = config;
        Ok(())
    }
}

pub(crate) fn clear_platform() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        return clear_macos();
    }
    #[cfg(target_os = "windows")]
    {
        return clear_windows();
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Ok(())
    }
}
