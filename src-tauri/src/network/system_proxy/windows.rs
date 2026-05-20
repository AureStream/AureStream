//! Windows 系统代理：写注册表 HKCU\...\Internet Settings 并通知系统刷新。

use crate::models::proxy_config::ProxyConfig;

use super::common::{ensure_loopback_bypass, parse_bypass_domains, system_proxy_host};

fn parse_bypass_domains_windows(raw: &str) -> String {
    let mut domains = parse_bypass_domains(raw);
    ensure_loopback_bypass(&mut domains);
    domains.join(";")
}

/// 通知 Windows 系统代理设置已变更，让浏览器等应用立即生效。
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

pub fn apply(config: &ProxyConfig) -> Result<(), String> {
    if config.mixed_port == 0 {
        return Err("系统代理端口未就绪，请重新连接".to_string());
    }
    let host = system_proxy_host(&config.listen);
    let proxy_server = format!("http={}:{}", host, config.mixed_port);
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

pub fn clear() -> Result<(), String> {
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
