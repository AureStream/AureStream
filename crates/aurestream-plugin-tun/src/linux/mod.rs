use std::process::Command;
use std::sync::Mutex;

static DNS_OVERRIDE: Mutex<Option<(String, String)>> = Mutex::new(None);

pub fn set_dns_override(info: Option<(String, String)>) {
    *DNS_OVERRIDE.lock().unwrap_or_else(|e| e.into_inner()) = info;
}

pub fn take_dns_override() -> Option<(String, String)> {
    DNS_OVERRIDE
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .take()
}

pub fn stop_tun_and_restore_dns(dns_override: Option<&(String, String)>) -> Result<(), String> {
    aurestream_plugin_privilege::linux::stop_tun_and_restore_dns(dns_override)
}

pub fn stop_tun_process() -> Result<(), String> {
    stop_tun_and_restore_dns(None)
}

fn detect_active_iface() -> Result<String, String> {
    let out = Command::new("sh")
        .arg("-c")
        .arg("ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i==\"dev\") print $(i+1)}' | head -1")
        .output()
        .map_err(|e| format!("ip route get failed: {}", e))?;
    let iface = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if iface.is_empty() {
        Err("no default interface".into())
    } else {
        Ok(iface)
    }
}

fn capture_original_dns(iface: &str) -> Result<String, String> {
    let out = Command::new("nmcli")
        .args(["-t", "-f", "IP4.DNS", "dev", "show", iface])
        .output()
        .map_err(|e| format!("nmcli failed: {}", e))?;
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

    let out = Command::new("resolvectl")
        .args(["status", iface])
        .output()
        .map_err(|e| format!("resolvectl status failed: {}", e))?;
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

    Err(format!("could not determine original DNS for {}", iface))
}

pub fn prepare_dns_override(gateway: &str) -> Result<(String, String), String> {
    let iface = detect_active_iface()?;
    let original_dns = capture_original_dns(&iface)?;
    log::info!(
        "[dns] captured original DNS for [{}]: {}",
        iface,
        original_dns
    );
    Ok((iface, original_dns))
}

pub fn apply_system_dns_override(gateway: &str) -> Result<(String, String), String> {
    let iface = detect_active_iface()?;
    let original_dns = capture_original_dns(&iface)?;

    log::info!(
        "[dns] resolvectl override → {} for [{}] (original: {})",
        gateway,
        iface,
        original_dns
    );
    aurestream_plugin_privilege::linux::apply_dns_override(&iface, gateway, &original_dns)?;
    Ok((iface, original_dns))
}

pub fn restore_system_dns(iface: &str, original_dns: &str) -> Result<(), String> {
    log::info!(
        "[dns] restore: setting [{}] DNS back to {}",
        iface,
        original_dns
    );
    aurestream_plugin_privilege::linux::restore_dns(iface, original_dns)
}
