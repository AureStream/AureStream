//! macOS 系统代理：通过 Security.framework 获取管理员授权，修改网络服务代理设置。

use log::info;
use std::io::{BufRead, BufReader, Read};
use std::process::Command;
use std::sync::Mutex;
use security_framework::authorization::{Authorization, Flags as AuthFlags};
use security_framework_sys::authorization::AuthorizationExternalForm;

use crate::models::proxy_config::ProxyConfig;

use super::common::{parse_bypass_domains, system_proxy_host};

static SYSTEM_PROXY_AUTH: Mutex<Option<AuthorizationExternalForm>> = Mutex::new(None);

fn posix_single_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\"'\"'"))
}

fn networksetup_cmdline(args: &[impl AsRef<str>]) -> String {
    let mut line = String::from("/usr/sbin/networksetup");
    for a in args {
        line.push(' ');
        line.push_str(&posix_single_quote(a.as_ref()));
    }
    line
}

/// 获取已缓存的授权，或创建新授权（首次调用弹出密码对话框）
fn get_or_create_auth() -> Result<Authorization, String> {
    if let Ok(mut guard) = SYSTEM_PROXY_AUTH.lock() {
        if let Some(external) = guard.as_ref() {
            match Authorization::try_from(*external) {
                Ok(auth) => return Ok(auth),
                Err(e) => {
                    tracing::warn!("[system-proxy] 缓存授权恢复失败({})，重新获取", e);
                    *guard = None;
                }
            }
        }
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

    if let Ok(mut guard) = SYSTEM_PROXY_AUTH.lock() {
        *guard = Some(external);
    }

    Ok(auth)
}

/// 通过已缓存的授权执行 shell 命令链，等待其完成并检查输出
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
        tracing::warn!("[system-proxy] networksetup 输出: {}", trimmed);
    }
    Ok(())
}

/// 无管理员权限直接执行 shell 命令（用于关闭代理的首选方式）
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

fn macos_list_network_services() -> Result<Vec<String>, String> {
    // 1. 使用 scutil --nwi 获取当前活跃的网络接口 (例如 en0)
    let nwi_out = Command::new("/usr/sbin/scutil")
        .arg("--nwi")
        .output()
        .map_err(|e| format!("scutil 失败: {}", e))?;
    let nwi_str = String::from_utf8_lossy(&nwi_out.stdout);
    let mut active_ifaces = Vec::new();
    for line in nwi_str.lines() {
        if line.starts_with("Network interfaces:") {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() > 2 {
                for i in 2..parts.len() {
                    active_ifaces.push(parts[i].trim().trim_matches(',').to_string());
                }
            }
        }
    }

    // 2. 使用 networksetup -listallhardwareports 将接口 (en0) 映射回服务名 (Wi-Fi)
    let hw_out = Command::new("/usr/sbin/networksetup")
        .arg("-listallhardwareports")
        .output()
        .map_err(|e| format!("networksetup 失败: {}", e))?;
    let hw_str = String::from_utf8_lossy(&hw_out.stdout);
    let mut services = Vec::new();
    let mut current_port = String::new();
    for line in hw_str.lines() {
        if line.starts_with("Hardware Port: ") {
            current_port = line.trim_start_matches("Hardware Port: ").trim().to_string();
        } else if line.starts_with("Device: ") {
            let device = line.trim_start_matches("Device: ").trim().to_string();
            if active_ifaces.contains(&device) {
                services.push(current_port.clone());
            }
        }
    }
    
    services.dedup();
    if services.is_empty() {
        // 退避策略：如果找不到活跃接口，至少设置常见的网络服务
        services.push("Wi-Fi".to_string());
        services.push("Ethernet".to_string());
    }
    
    Ok(services)
}

/// 本机回环必须绕过系统代理
const LOOPBACK_BYPASS: &[&str] = &["localhost", "127.0.0.1", "<local>"];

fn merge_bypass_with_loopback(parsed: Vec<String>) -> Vec<String> {
    let mut out: Vec<String> = LOOPBACK_BYPASS.iter().map(|s| (*s).to_string()).collect();
    for item in parsed {
        if !out.iter().any(|x| x == &item) {
            out.push(item);
        }
    }
    out
}

pub fn apply(config: &ProxyConfig) -> Result<(), String> {
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
    run_shell_chain_direct(&chain)
}

pub fn clear() -> Result<(), String> {
    let services = macos_list_network_services()?;
    let mut cmds: Vec<String> = Vec::new();
    for svc in &services {
        cmds.push(networksetup_cmdline(&["-setwebproxystate", svc, "off"]));
        cmds.push(networksetup_cmdline(&["-setsecurewebproxystate", svc, "off"]));
        cmds.push(networksetup_cmdline(&["-setsocksfirewallproxystate", svc, "off"]));
    }
    let chain = cmds.join(" ; ");
    run_shell_chain_direct(&chain)
}
