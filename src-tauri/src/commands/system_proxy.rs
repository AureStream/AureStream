//! 系统级代理：连接成功后写入 OS 代理设置，断开或退出时尽量关闭。
//! macOS：通过 Security.framework `AuthorizationCreate` 获取一次管理员授权，后续开/关代理
//!       均复用同一授权（不再弹密码框）。仅在首次需要特权时弹出系统密码对话框。
//! Windows：写注册表 HKCU\...\Internet Settings 并通知系统刷新。

use crate::commands::ProxyConfig;
#[cfg(target_os = "macos")]
use log::info;
#[cfg(target_os = "macos")]
use std::io::{BufRead, BufReader, Read};
#[cfg(target_os = "macos")]
use std::process::Command;
#[cfg(target_os = "macos")]
use std::sync::OnceLock;
#[cfg(target_os = "macos")]
use security_framework::authorization::{Authorization, Flags as AuthFlags};
#[cfg(target_os = "macos")]
use security_framework_sys::authorization::AuthorizationExternalForm;

#[cfg(target_os = "macos")]
static SYSTEM_PROXY_AUTH: OnceLock<AuthorizationExternalForm> = OnceLock::new();

#[cfg(target_os = "macos")]
fn posix_single_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\"'\"'"))
}

#[cfg(target_os = "macos")]
fn networksetup_cmdline(args: &[impl AsRef<str>]) -> String {
    let mut line = String::from("/usr/sbin/networksetup");
    for a in args {
        line.push(' ');
        line.push_str(&posix_single_quote(a.as_ref()));
    }
    line
}

/// 获取已缓存的授权，或创建新授权（首次调用弹出密码对话框）
#[cfg(target_os = "macos")]
fn get_or_create_auth() -> Result<Authorization, String> {
    if let Some(external) = SYSTEM_PROXY_AUTH.get() {
        return Authorization::try_from(*external)
            .map_err(|e| format!("从缓存恢复授权失败: {}", e));
    }

    info!("[system-proxy] 正在请求管理员权限以修改系统代理（仅此一次）");
    let auth = Authorization::new(
        None,
        None,
        AuthFlags::INTERACTION_ALLOWED | AuthFlags::EXTEND_RIGHTS,
    )
    .map_err(|e| {
        let msg = e.to_string();
        if msg.contains("-60005") || msg.to_lowercase().contains("cancel") {
            "已取消管理员授权，无法修改系统代理".to_string()
        } else {
            format!("获取系统授权失败: {}", msg)
        }
    })?;

    let external = auth
        .make_external_form()
        .map_err(|e| format!("序列化授权失败: {}", e))?;

    // OnceLock::set 可能因竞态失败，此时另一个线程已存储，忽略即可
    let _ = SYSTEM_PROXY_AUTH.set(external);

    Ok(auth)
}

/// 通过已缓存的授权执行 shell 命令链，等待其完成并检查输出
#[cfg(target_os = "macos")]
fn run_shell_chain_with_auth(chain: &str) -> Result<(), String> {
    let auth = get_or_create_auth()?;

    let mut pipe = auth
        .execute_with_privileges_piped("/bin/sh", ["-c", chain], AuthFlags::default())
        .map_err(|e| format!("执行管理员命令失败: {}", e))?;

    let mut output = String::new();
    pipe.read_to_string(&mut output)
        .map_err(|e| format!("读取命令输出失败: {}", e))?;

    let trimmed = output.trim();
    if !trimmed.is_empty() {
        // networksetup 执行成功的输出通常为空；有输出多为错误
        tracing::warn!("[system-proxy] networksetup 输出: {}", trimmed);
    }
    Ok(())
}

/// 无管理员权限直接执行 shell 命令（用于关闭代理的首选方式）
#[cfg(target_os = "macos")]
fn run_shell_chain_direct(chain: &str) -> Result<(), String> {
    let out = Command::new("/bin/sh")
        .args(["-c", chain])
        .output()
        .map_err(|e| format!("执行 shell 命令失败: {}", e))?;
    if !out.status.success() {
        return Err(format!(
            "命令执行失败: {}",
            String::from_utf8_lossy(&out.stderr).trim()
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
    let mut cmds: Vec<String> = Vec::new();
    for svc in &services {
        cmds.push(networksetup_cmdline(&["-setwebproxy", svc, &host, &port]));
        cmds.push(networksetup_cmdline(&["-setsecurewebproxy", svc, &host, &port]));
        cmds.push(networksetup_cmdline(&["-setsocksfirewallproxy", svc, &host, &port]));

        let mut bypass_line: Vec<String> =
            vec!["-setproxybypassdomains".to_string(), svc.clone()];
        bypass_line.extend(bypass_domains.iter().cloned());
        let bypass_refs: Vec<&str> = bypass_line.iter().map(|s| s.as_str()).collect();
        cmds.push(networksetup_cmdline(&bypass_refs));

        cmds.push(networksetup_cmdline(&["-setwebproxystate", svc, "on"]));
        cmds.push(networksetup_cmdline(&["-setsecurewebproxystate", svc, "on"]));
        cmds.push(networksetup_cmdline(&["-setsocksfirewallproxystate", svc, "on"]));
    }
    let chain = cmds.join(" && ");
    run_shell_chain_with_auth(&chain)
}

#[cfg(target_os = "macos")]
fn clear_macos() -> Result<(), String> {
    let services = macos_list_network_services()?;
    let mut cmds: Vec<String> = Vec::new();
    for svc in &services {
        cmds.push(networksetup_cmdline(&["-setwebproxystate", svc, "off"]));
        cmds.push(networksetup_cmdline(&["-setsecurewebproxystate", svc, "off"]));
        cmds.push(networksetup_cmdline(&["-setsocksfirewallproxystate", svc, "off"]));
    }
    let chain = cmds.join(" ; ");
    // 关闭代理优先尝试无管理员权限
    if run_shell_chain_direct(&chain).is_ok() {
        return Ok(());
    }
    // 回退到管理员权限（复用首次的授权，不弹框）
    run_shell_chain_with_auth(&chain)
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
