use std::fs;
#[cfg(any(target_os = "windows", target_os = "linux"))]
use std::path::Path;
#[cfg(any(target_os = "windows", target_os = "linux"))]
use tauri::utils::platform;

#[cfg(any(target_os = "windows", target_os = "linux"))]
pub fn get_sidecar_path(program: &Path) -> Result<String, anyhow::Error> {
    match platform::current_exe()?.parent() {
        #[cfg(windows)]
        Some(exe_dir) => {
            let raw = exe_dir
                .join(program)
                .with_extension("exe")
                .to_string_lossy()
                .into_owned();
            // Strip \\?\ verbatim prefix so SYSTEM services can spawn the binary
            Ok(strip_verbatim_prefix(&raw).to_string())
        }
        #[cfg(not(windows))]
        Some(exe_dir) => Ok(exe_dir.join(program).to_string_lossy().into_owned()),
        None => Err(anyhow::anyhow!("Failed to get the executable directory")),
    }
}

#[cfg(windows)]
fn strip_verbatim_prefix(s: &str) -> &str {
    s.strip_prefix(r"\\?\").unwrap_or(s)
}

/// Extracts the IPv4 gateway address from an Xray-core `tun` inbound
/// (`inbounds[].protocol == "tun"`, `settings.gateway: string[]`, each entry
/// a CIDR like `"172.19.0.1/30"`). Returns the bare IP, no prefix length.
pub fn extract_tun_gateway_from_config(config_path: &str) -> Option<String> {
    let content = fs::read_to_string(config_path).ok()?;
    let v: serde_json::Value = serde_json::from_str(&content).ok()?;
    let inbounds = v.get("inbounds")?.as_array()?;
    for inb in inbounds {
        if inb.get("protocol").and_then(serde_json::Value::as_str) != Some("tun") {
            continue;
        }
        let Some(gateways) = inb
            .get("settings")
            .and_then(|s| s.get("gateway"))
            .and_then(serde_json::Value::as_array)
        else {
            continue;
        };
        for g in gateways {
            let Some(s) = g.as_str() else { continue };
            let Some(ip) = s.split('/').next() else {
                continue;
            };
            if ip.contains('.') && !ip.is_empty() {
                return Some(ip.to_string());
            }
        }
    }
    None
}
