use std::fs;
use std::path::Path;
use tauri::utils::platform;

/// Directory the running executable (and its Tauri `externalBin` sidecars)
/// live in — same on all three platforms (macOS `Contents/MacOS/`, Windows
/// next to the `.exe`, Linux next to the main binary).
pub fn sidecar_dir() -> Result<std::path::PathBuf, anyhow::Error> {
    platform::current_exe()?
        .parent()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| anyhow::anyhow!("Failed to get the executable directory"))
}

/// Resolve a Tauri `externalBin` sidecar next to the main executable.
/// Prefers the production name (`aurestream-core[.exe]`), then any
/// triple-suffixed sibling left by `tauri dev` / bundling
/// (`aurestream-core-x86_64-pc-windows-msvc.exe`).
fn resolve_sidecar_in_dir(exe_dir: &Path, program: &Path) -> std::path::PathBuf {
    #[cfg(windows)]
    let plain = exe_dir.join(program).with_extension("exe");
    #[cfg(not(windows))]
    let plain = exe_dir.join(program);

    if plain.exists() {
        return plain;
    }

    let stem = program
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("aurestream-core");
    #[cfg(windows)]
    let prefix = format!("{}-", stem);
    #[cfg(not(windows))]
    let prefix = format!("{}-", stem);
    #[cfg(windows)]
    let suffix = ".exe";
    #[cfg(not(windows))]
    let suffix = "";

    if let Ok(entries) = fs::read_dir(exe_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let Some(name) = name.to_str() else {
                continue;
            };
            if name.starts_with(&prefix) && name.ends_with(suffix) && entry.path().is_file() {
                return entry.path();
            }
        }
    }

    plain
}

#[allow(dead_code)] // only called from windows/mod.rs and linux/mod.rs
pub fn get_sidecar_path(program: &Path) -> Result<String, anyhow::Error> {
    match platform::current_exe()?.parent() {
        #[cfg(windows)]
        Some(exe_dir) => {
            let path = resolve_sidecar_in_dir(exe_dir, program);
            let raw = path.to_string_lossy().into_owned();
            // Strip \\?\ verbatim prefix so SYSTEM services can spawn the binary
            Ok(strip_verbatim_prefix(&raw).to_string())
        }
        #[cfg(not(windows))]
        Some(exe_dir) => {
            let path = resolve_sidecar_in_dir(exe_dir, program);
            Ok(path.to_string_lossy().into_owned())
        }
        None => Err(anyhow::anyhow!("Failed to get the executable directory")),
    }
}

#[cfg(windows)]
fn strip_verbatim_prefix(s: &str) -> &str {
    s.strip_prefix(r"\\?\").unwrap_or(s)
}

/// Extracts the IPv4 gateway address from an Xray-core `tun` inbound
/// (`inbounds[].protocol == "tun"`, `settings.gateway: string[]`, each entry
/// a CIDR like `"198.18.0.1/30"`). Returns the bare IP, no prefix length.
pub fn extract_tun_gateway_from_config(config_path: &str) -> Option<String> {
    let content = fs::read_to_string(config_path).ok()?;
    let v: serde_json::Value = serde_json::from_str(&content).ok()?;
    extract_tun_gateway_from_value(&v)
}

fn extract_tun_gateway_from_value(v: &serde_json::Value) -> Option<String> {
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

/// OS NameServer hijack target for TUN mode.
///
/// Prefers `settings.dns[0]` (XTLS TUN docs: routable resolvers like `1.1.1.1`)
/// so queries enter the TUN stack and hit `port:53 → dns-out`. Falls back to
/// the gateway bare IP for older configs that still set `dns: [gateway]`.
pub fn extract_tun_dns_hijack_from_config(config_path: &str) -> Option<String> {
    let content = fs::read_to_string(config_path).ok()?;
    let v: serde_json::Value = serde_json::from_str(&content).ok()?;
    let inbounds = v.get("inbounds")?.as_array()?;
    for inb in inbounds {
        if inb.get("protocol").and_then(serde_json::Value::as_str) != Some("tun") {
            continue;
        }
        if let Some(dns) = inb
            .get("settings")
            .and_then(|s| s.get("dns"))
            .and_then(serde_json::Value::as_array)
        {
            for d in dns {
                let Some(ip) = d.as_str() else { continue };
                // Bare IPv4 only — skip DoH URLs / IPv6 for the Windows NameServer list.
                if ip.contains('.') && !ip.contains(':') && !ip.contains('/') && !ip.is_empty() {
                    return Some(ip.to_string());
                }
            }
        }
    }
    extract_tun_gateway_from_value(&v)
}
