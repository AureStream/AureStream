//! Linux TUN: unprivileged client + elevated systemd helper over a Unix socket.

mod client;
mod iface;
mod protocol;
mod service;

pub use service::helper_main;

use super::{not_installed_error, TunError, TunServiceState};
use std::path::{Path, PathBuf};

pub const HELPER_PATH: &str = "/usr/lib/AureStream/aurestream-tun-helper";
const TRUSTED_CORE_PATHS: [&str; 2] = [
    "/usr/lib/AureStream/aurestream-core",
    "/usr/bin/aurestream-core",
];
const SOCKET_UNIT: &str = "/etc/systemd/system/aurestream-tun.socket";

pub fn probe() -> TunServiceState {
    if !helper_path().is_file()
        || !TRUSTED_CORE_PATHS
            .iter()
            .any(|path| Path::new(path).is_file())
    {
        return TunServiceState::NotInstalled;
    }
    match client::status() {
        Ok(state) if state == "running" => TunServiceState::Running,
        Ok(_) => TunServiceState::Ready,
        Err(_) if control_plane_installed() => TunServiceState::Ready,
        Err(_) => TunServiceState::NotInstalled,
    }
}

fn helper_path() -> PathBuf {
    if let Ok(p) = std::env::var("AURESTREAM_TUN_HELPER") {
        let path = PathBuf::from(p);
        if path.is_file() {
            return path;
        }
    }
    PathBuf::from(HELPER_PATH)
}

fn control_plane_installed() -> bool {
    protocol::socket_path().exists() || Path::new(SOCKET_UNIT).is_file()
}

pub fn start_tun(
    config_path: &Path,
    _core_path: &Path,
    dns_hijack: &str,
    _asset_dir: Option<&Path>,
) -> Result<(), TunError> {
    if !helper_path().is_file() {
        return Err(not_installed_error());
    }
    if !control_plane_installed() {
        return Err(TunError::failed(
            "tun_socket_missing",
            "虚拟网卡控制服务未安装。请重新运行 scripts/install-linux-tun-helper.sh 或使用 deb/rpm 安装包。",
        ));
    }

    let iface = detect_active_iface().map_err(|e| {
        TunError::failed(
            "tun_outbound_interface",
            format!("无法确定代理流量的物理出口网卡: {e}"),
        )
    })?;
    match super::config_patch::patch_tun_config_outbounds_interface(
        config_path.to_str().ok_or_else(|| {
            TunError::failed("bad_path", "config path is not UTF-8")
        })?,
        &iface,
    ) {
        Ok(true) => log::info!("[tun/linux] patched outbound interface -> {iface}"),
        Ok(false) => log::debug!("[tun/linux] outbound interface already {iface}"),
        Err(e) => {
            return Err(TunError::failed(
                "tun_route_patch",
                format!("准备代理节点绕行路由失败: {e}"),
            ));
        }
    }

    let original_dns = match capture_original_dns(&iface) {
        Ok(dns) => {
            log::info!("[tun/linux] captured DNS iface={iface} original={dns}");
            dns.split_whitespace()
                .map(|s| s.to_string())
                .collect::<Vec<_>>()
        }
        Err(e) => {
            log::warn!("[tun/linux] DNS capture failed (continuing without hijack restore): {e}");
            Vec::new()
        }
    };
    let search_suffixes = capture_search_domains(&iface);
    let config = config_path
        .to_str()
        .ok_or_else(|| TunError::failed("bad_path", "config path is not UTF-8"))?;
    match crate::dns_policy::patch_tun_intranet_dns(config, &original_dns, &search_suffixes) {
        Ok(true) => log::info!(
            "[tun/linux] patched intranet DNS private={:?} suffixes={:?}",
            crate::dns_policy::private_dns_servers(&original_dns),
            search_suffixes
        ),
        Ok(false) => log::debug!("[tun/linux] intranet DNS patch unchanged"),
        Err(e) => log::warn!("[tun/linux] intranet DNS patch skipped: {e}"),
    }

    let api_port = parse_api_port_from_config(config_path).unwrap_or(10809);
    let gateway = if dns_hijack.is_empty() {
        "1.1.1.1".to_string()
    } else {
        dns_hijack.to_string()
    };

    log::info!(
        "[tun/linux] socket start-tun helper={} config={} api={} dns={} iface={}",
        helper_path().display(),
        config,
        api_port,
        gateway,
        iface
    );

    client::start(protocol::TunRequest::Start {
        config: config.to_string(),
        caller_pid: std::process::id(),
        api_port,
        dns: gateway,
        iface,
        original_dns,
    })?;
    // Helper already flushes as root; repeat from the session so stub caches
    // that the user bus can see (poisoned Google A/AAAA) are dropped too.
    match std::process::Command::new("resolvectl")
        .arg("flush-caches")
        .status()
    {
        Ok(status) if status.success() => {
            log::info!("[tun/linux] flushed systemd-resolved caches");
        }
        Ok(status) => log::warn!("[tun/linux] resolvectl flush-caches exit={status}"),
        Err(e) => log::warn!("[tun/linux] resolvectl flush-caches: {e}"),
    }
    Ok(())
}

pub fn stop_tun() -> Result<(), TunError> {
    match client::status() {
        Ok(state) if state != "running" => return Ok(()),
        Ok(_) => {}
        Err(_) if !control_plane_installed() => return Ok(()),
        Err(_) => {}
    }
    client::stop()
}

pub fn uninstall_helper() -> Result<(), TunError> {
    let helper = helper_path();
    if !helper.is_file() {
        log::info!("[tun/linux] helper not installed, nothing to uninstall");
        return Ok(());
    }
    log::info!("[tun/linux] pkexec uninstall {}", helper.display());
    let output = std::process::Command::new("pkexec")
        .arg(helper.as_os_str())
        .arg("uninstall")
        .output()
        .map_err(|e| TunError::failed("helper_uninstall", format!("pkexec spawn failed: {e}")))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(TunError::failed(
            "helper_uninstall",
            format!(
                "卸载虚拟网卡 Helper 失败（需授权）: {}{}",
                stderr.trim(),
                stdout.trim()
            ),
        ));
    }
    Ok(())
}

fn detect_active_iface() -> Result<String, String> {
    let default_text = run_ip(&["-o", "route", "show", "default"]).unwrap_or_default();
    let get_text = run_ip(&["route", "get", "1.1.1.1"]).unwrap_or_default();
    let mut devs = iface::parse_route_devs(&default_text);
    for dev in iface::parse_route_devs(&get_text) {
        if !devs.contains(&dev) {
            devs.push(dev);
        }
    }
    iface::pick_physical_dev(&devs).ok_or_else(|| "no default physical interface".into())
}

fn run_ip(args: &[&str]) -> Result<String, String> {
    let out = std::process::Command::new("ip")
        .args(args)
        .output()
        .map_err(|e| format!("ip {} failed: {e}", args.join(" ")))?;
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

fn capture_search_domains(iface: &str) -> Vec<String> {
    let out = std::process::Command::new("resolvectl")
        .args(["domain", iface])
        .output();
    match out {
        Ok(o) if o.status.success() => {
            crate::dns_policy::parse_search_domains(&String::from_utf8_lossy(&o.stdout))
        }
        _ => Vec::new(),
    }
}

fn capture_original_dns(iface: &str) -> Result<String, String> {
    if let Ok(out) = std::process::Command::new("nmcli")
        .args(["-t", "-f", "IP4.DNS", "dev", "show", iface])
        .output()
    {
        let stdout = String::from_utf8_lossy(&out.stdout);
        let servers: Vec<&str> = stdout
            .lines()
            .filter_map(|l| l.split(':').nth(1))
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .collect();
        if !servers.is_empty() {
            return Ok(servers.join(" "));
        }
    }

    if let Ok(out) = std::process::Command::new("resolvectl")
        .args(["status", iface])
        .output()
    {
        let stdout = String::from_utf8_lossy(&out.stdout);
        for line in stdout.lines() {
            let line = line.trim();
            if line.starts_with("DNS Servers:") || line.starts_with("Current DNS Server:") {
                if let Some(servers) = line.split(':').nth(1) {
                    let s = servers.trim();
                    if !s.is_empty() {
                        return Ok(s.to_string());
                    }
                }
            }
        }
    }

    let contents = std::fs::read_to_string("/etc/resolv.conf")
        .map_err(|e| format!("read resolv.conf: {e}"))?;
    let nameservers: Vec<&str> = contents
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            trimmed.strip_prefix("nameserver").map(|s| s.trim())
        })
        .filter(|s| !s.is_empty() && *s != "198.18.0.1")
        .collect();
    if !nameservers.is_empty() {
        return Ok(nameservers.join(" "));
    }
    Err(format!("could not determine original DNS for {iface}"))
}

fn parse_api_port_from_config(path: &Path) -> Option<u16> {
    let raw = std::fs::read_to_string(path).ok()?;
    let v: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let arr = v.get("inbounds")?.as_array()?;
    for ib in arr {
        if ib.get("tag").and_then(|t| t.as_str()) == Some("api") {
            return ib.get("port").and_then(|p| p.as_u64()).map(|p| p as u16);
        }
    }
    None
}
