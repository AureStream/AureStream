//! DNS override primitives — ported from `vpn/windows_native.rs` so the service
//! can run them in its own process without depending on the main app crate.
//!
//! All functions write to `HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\
//! Parameters\Interfaces\{GUID}\NameServer` via raw `windows` crate calls.
//! The original values are persisted before an override and restored verbatim
//! on stop, including an intentionally empty static-DNS value.

#![cfg(target_os = "windows")]
#![allow(dead_code)]

use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use std::ptr;

use serde::{Deserialize, Serialize};

use windows::core::{PCWSTR, PWSTR};
use windows::Win32::Foundation::{ERROR_NO_MORE_ITEMS, ERROR_SUCCESS};
use windows::Win32::System::Registry::{
    RegCloseKey, RegEnumKeyExW, RegOpenKeyExW, RegQueryValueExW, RegSetValueExW, HKEY,
    HKEY_LOCAL_MACHINE, KEY_READ, KEY_SET_VALUE, REG_SAM_FLAGS, REG_SZ, REG_VALUE_TYPE,
};

pub const TCPIP_INTERFACES: &str = r"SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces";
pub const NET_CLASS_GUID: &str = "{4D36E972-E325-11CE-BFC1-08002BE10318}";
const DNS_SNAPSHOT_FILE: &str = "dns-snapshot.json";

// =========================== pure helpers =============================

pub fn normalize_guid(s: &str) -> Option<String> {
    let t = s.trim();
    let inner = t.trim_start_matches('{').trim_end_matches('}');
    if inner.len() != 36 {
        return None;
    }
    let bytes = inner.as_bytes();
    if bytes[8] != b'-' || bytes[13] != b'-' || bytes[18] != b'-' || bytes[23] != b'-' {
        return None;
    }
    if !inner.chars().all(|c| c == '-' || c.is_ascii_hexdigit()) {
        return None;
    }
    Some(format!("{{{}}}", inner.to_ascii_uppercase()))
}

pub fn interface_reg_path(guid: &str) -> String {
    format!(r"{}\{}", TCPIP_INTERFACES, guid)
}

pub fn connection_reg_path(guid: &str) -> String {
    format!(
        r"SYSTEM\CurrentControlSet\Control\Network\{}\{}\Connection",
        NET_CLASS_GUID, guid
    )
}

pub fn is_tun_alias(alias: &str) -> bool {
    let lc = alias.to_ascii_lowercase();
    lc.contains("sing-box")
        || lc.contains("xray")
        || lc.contains("wintun")
        || lc.contains("utun")
        || lc.contains("tap-windows")
        || lc.contains("aurestream")
}

pub fn is_virtual_or_tun_alias(alias: &str) -> bool {
    let lc = alias.to_ascii_lowercase();
    is_tun_alias(alias)
        || lc.contains("loopback")
        || lc.contains("vethernet")
        || lc.contains("hyper-v")
        || lc.contains("wsl")
        || lc.contains("virtualbox")
        || lc.contains("vmware")
        || lc.contains("docker")
        || lc.contains("wireguard")
        || lc.contains("vpn")
}

pub fn format_nameserver_value(servers: &[&str]) -> String {
    servers
        .iter()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(",")
}

pub fn parse_nameserver_value(value: &str) -> Vec<&str> {
    value
        .split([',', ' ', '\0'])
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect()
}

pub fn nameserver_with_gateway_first<'a>(current: &'a str, gateway: &'a str) -> Vec<&'a str> {
    let g = gateway.trim();
    let mut servers = Vec::new();
    if !g.is_empty() {
        servers.push(g);
    }
    servers.extend(
        parse_nameserver_value(current)
            .into_iter()
            .filter(|s| *s != g),
    );
    servers
}

/// DNS list used while TUN is up: **only** the hijack resolver.
///
/// Do not preserve the NIC's previous NameServer list — domestic fallbacks
/// like `114.114.114.114` will answer poisoned A records for YouTube/Google
/// when the tunneled `1.1.1.1`/`8.8.8.8` path is slow and Windows times out.
pub fn nameserver_tun_hijack_only(hijack: &str) -> Vec<&str> {
    let g = hijack.trim();
    if g.is_empty() || g == "-" {
        Vec::new()
    } else {
        vec![g]
    }
}

pub fn nameserver_without_gateway<'a>(current: &'a str, gateway: &str) -> Vec<&'a str> {
    let g = gateway.trim();
    parse_nameserver_value(current)
        .into_iter()
        .filter(|s| *s != g)
        .collect()
}

pub fn has_nonzero_ip(raw: &str) -> bool {
    raw.split(['\0', ' ', ','])
        .any(|s| !s.is_empty() && s != "0.0.0.0")
}

// =========================== Win32 helpers =============================

fn to_wide_z(s: &str) -> Vec<u16> {
    OsStr::new(s).encode_wide().chain(Some(0)).collect()
}

fn from_wide_lossy(buf: &[u16]) -> String {
    let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    String::from_utf16_lossy(&buf[..end])
}

struct RegKey(HKEY);

impl Drop for RegKey {
    fn drop(&mut self) {
        if self.0 .0 as usize != 0 {
            unsafe {
                let _ = RegCloseKey(self.0);
            }
        }
    }
}

fn open_key(root: HKEY, path: &str, access: REG_SAM_FLAGS) -> Result<RegKey, String> {
    let w = to_wide_z(path);
    let mut h = HKEY(ptr::null_mut());
    let rc = unsafe { RegOpenKeyExW(root, PCWSTR(w.as_ptr()), Some(0), access, &mut h) };
    if rc != ERROR_SUCCESS {
        return Err(format!("RegOpenKeyExW({}) failed: {:?}", path, rc.0));
    }
    Ok(RegKey(h))
}

fn query_string_value(key: &RegKey, name: &str) -> Option<String> {
    let wname = to_wide_z(name);
    let mut ty = REG_VALUE_TYPE::default();
    let mut size: u32 = 0;
    let rc = unsafe {
        RegQueryValueExW(
            key.0,
            PCWSTR(wname.as_ptr()),
            None,
            Some(&mut ty),
            None,
            Some(&mut size),
        )
    };
    if rc != ERROR_SUCCESS || size == 0 {
        return None;
    }
    let mut buf = vec![0u8; size as usize];
    let rc = unsafe {
        RegQueryValueExW(
            key.0,
            PCWSTR(wname.as_ptr()),
            None,
            Some(&mut ty),
            Some(buf.as_mut_ptr()),
            Some(&mut size),
        )
    };
    if rc != ERROR_SUCCESS {
        return None;
    }
    let u16_len = (size as usize) / 2;
    let wide: Vec<u16> = (0..u16_len)
        .map(|i| u16::from_le_bytes([buf[i * 2], buf[i * 2 + 1]]))
        .collect();
    Some(from_wide_lossy(&wide))
}

fn set_string_value(key: &RegKey, name: &str, value: &str) -> Result<(), String> {
    let wname = to_wide_z(name);
    let wvalue = to_wide_z(value);
    let bytes: &[u8] =
        unsafe { std::slice::from_raw_parts(wvalue.as_ptr() as *const u8, wvalue.len() * 2) };
    let rc = unsafe { RegSetValueExW(key.0, PCWSTR(wname.as_ptr()), Some(0), REG_SZ, Some(bytes)) };
    if rc != ERROR_SUCCESS {
        return Err(format!("RegSetValueExW({}) failed: {:?}", name, rc.0));
    }
    Ok(())
}

fn enum_subkey_names(key: &RegKey) -> Result<Vec<String>, String> {
    let mut out = Vec::new();
    let mut idx: u32 = 0;
    loop {
        let mut buf = [0u16; 256];
        let mut len: u32 = buf.len() as u32;
        let rc = unsafe {
            RegEnumKeyExW(
                key.0,
                idx,
                Some(PWSTR(buf.as_mut_ptr())),
                &mut len,
                None,
                None,
                None,
                None,
            )
        };
        if rc == ERROR_NO_MORE_ITEMS {
            break;
        }
        if rc != ERROR_SUCCESS {
            return Err(format!("RegEnumKeyExW failed: {:?}", rc.0));
        }
        out.push(from_wide_lossy(&buf[..len as usize]));
        idx += 1;
    }
    Ok(out)
}

// =========================== public API =============================

#[derive(Debug, Clone)]
pub struct InterfaceInfo {
    pub guid: String,
    pub alias: String,
    pub has_ip: bool,
    pub current_dns: String,
}

impl InterfaceInfo {
    pub fn is_candidate_for_dns_override(&self) -> bool {
        self.has_ip && !is_virtual_or_tun_alias(&self.alias)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DnsSnapshotEntry {
    guid: String,
    alias: String,
    original_dns: String,
}

fn snapshot_path() -> std::path::PathBuf {
    let mut path = std::env::var_os("ProgramData")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    path.push("AureStream");
    path.push("service");
    path.push(DNS_SNAPSHOT_FILE);
    path
}

fn save_snapshot(entries: &[DnsSnapshotEntry]) -> Result<(), String> {
    let path = snapshot_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("create DNS snapshot directory: {e}"))?;
    }
    let body = serde_json::to_vec_pretty(entries)
        .map_err(|e| format!("serialize DNS snapshot: {e}"))?;
    let temp_path = path.with_extension("json.tmp");
    std::fs::write(&temp_path, body)
        .map_err(|e| format!("write {}: {e}", temp_path.display()))?;
    std::fs::rename(&temp_path, &path)
        .map_err(|e| format!("commit {}: {e}", path.display()))
}

fn restore_saved_snapshot() -> Option<(usize, usize)> {
    let path = snapshot_path();
    let body = match std::fs::read(&path) {
        Ok(body) => body,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return None,
        Err(e) => {
            log_line(&format!("read DNS snapshot failed: {e}"));
            return Some((0, 1));
        }
    };
    let entries: Vec<DnsSnapshotEntry> = match serde_json::from_slice(&body) {
        Ok(entries) => entries,
        Err(e) => {
            log_line(&format!("parse DNS snapshot failed: {e}"));
            return Some((0, 1));
        }
    };

    let mut ok = 0usize;
    let mut err = 0usize;
    for entry in entries {
        let servers = parse_nameserver_value(&entry.original_dns);
        match set_interface_dns(&entry.guid, &servers) {
            Ok(()) => {
                log_line(&format!(
                    "dns restore {} ({}) -> {}",
                    entry.guid, entry.alias, entry.original_dns
                ));
                ok += 1;
            }
            Err(e) => {
                log_line(&format!(
                    "dns restore {} ({}) FAILED: {}",
                    entry.guid, entry.alias, e
                ));
                err += 1;
            }
        }
    }
    if err == 0 {
        let _ = std::fs::remove_file(&path);
    }
    Some((ok, err))
}

pub fn enumerate_interfaces() -> Result<Vec<InterfaceInfo>, String> {
    let root = open_key(HKEY_LOCAL_MACHINE, TCPIP_INTERFACES, KEY_READ)?;
    let guids = enum_subkey_names(&root)?;
    let mut out = Vec::new();
    for guid in guids {
        if !guid.starts_with('{') {
            continue;
        }
        let iface_key = match open_key(HKEY_LOCAL_MACHINE, &interface_reg_path(&guid), KEY_READ) {
            Ok(k) => k,
            Err(_) => continue,
        };
        let dns = query_string_value(&iface_key, "NameServer").unwrap_or_default();
        let ip = query_string_value(&iface_key, "IPAddress").unwrap_or_default();
        let dhcp_ip = query_string_value(&iface_key, "DhcpIPAddress").unwrap_or_default();
        let has_ip = has_nonzero_ip(&ip) || has_nonzero_ip(&dhcp_ip);

        let alias = open_key(HKEY_LOCAL_MACHINE, &connection_reg_path(&guid), KEY_READ)
            .ok()
            .and_then(|k| query_string_value(&k, "Name"))
            .unwrap_or_default();

        out.push(InterfaceInfo {
            guid,
            alias,
            has_ip,
            current_dns: dns,
        });
    }
    Ok(out)
}

pub fn set_interface_dns(guid: &str, servers: &[&str]) -> Result<(), String> {
    let key = open_key(HKEY_LOCAL_MACHINE, &interface_reg_path(guid), KEY_SET_VALUE)?;
    let value = format_nameserver_value(servers);
    set_string_value(&key, "NameServer", &value)
}

pub fn reset_interface_dns(guid: &str) -> Result<(), String> {
    let key = open_key(HKEY_LOCAL_MACHINE, &interface_reg_path(guid), KEY_SET_VALUE)?;
    set_string_value(&key, "NameServer", "")
}

pub fn reset_all_interfaces_dns() -> (usize, usize) {
    let mut ok = 0usize;
    let mut err = 0usize;
    let list = match enumerate_interfaces() {
        Ok(l) => l,
        Err(e) => {
            log_line(&format!("enumerate_interfaces failed: {}", e));
            return (0, 0);
        }
    };
    for it in list {
        if !it.is_candidate_for_dns_override() {
            continue;
        }
        match reset_interface_dns(&it.guid) {
            Ok(()) => ok += 1,
            Err(e) => {
                log_line(&format!("reset {} ({}): {}", it.guid, it.alias, e));
                err += 1;
            }
        }
    }
    (ok, err)
}

/// Apply DNS override on the selected physical outbound interface. Idempotent.
/// Returns `(ok_count, err_count)`. An empty or `"-"` gateway is a no-op.
pub fn apply_override(gateway: &str, outbound_interface: Option<&str>) -> (usize, usize) {
    let g = gateway.trim();
    if g.is_empty() || g == "-" {
        return (0, 0);
    }
    // A stale snapshot means the previous service instance did not complete
    // cleanup. Restore it before taking a fresh snapshot.
    if let Some((_, stale_err)) = restore_saved_snapshot() {
        if stale_err != 0 {
            return (0, stale_err);
        }
    }
    let Some(outbound_interface) = outbound_interface
        .map(str::trim)
        .filter(|name| !name.is_empty())
    else {
        log_line("apply_override: physical outbound interface is missing");
        return (0, 1);
    };

    let list = match enumerate_interfaces() {
        Ok(l) => l,
        Err(e) => {
            log_line(&format!("apply_override: enumerate failed: {}", e));
            return (0, 1);
        }
    };
    let candidates: Vec<InterfaceInfo> = list
        .into_iter()
        .filter(|it| it.is_candidate_for_dns_override())
        .filter(|it| {
            it.alias == outbound_interface || it.alias.eq_ignore_ascii_case(outbound_interface)
        })
        .collect();
    if candidates.is_empty() {
        log_line(&format!(
            "apply_override: no physical interface matched {:?}",
            Some(outbound_interface)
        ));
        return (0, 1);
    }

    let snapshot: Vec<DnsSnapshotEntry> = candidates
        .iter()
        .map(|it| DnsSnapshotEntry {
            guid: it.guid.clone(),
            alias: it.alias.clone(),
            original_dns: it.current_dns.clone(),
        })
        .collect();
    if let Err(e) = save_snapshot(&snapshot) {
        log_line(&format!("apply_override: {e}"));
        return (0, 1);
    }

    let mut ok = 0usize;
    let mut err = 0usize;
    for it in candidates {
        let servers = nameserver_tun_hijack_only(g);
        match set_interface_dns(&it.guid, &servers) {
            Ok(()) => {
                log_line(&format!(
                    "dns override {} ({}) -> {}",
                    it.guid,
                    it.alias,
                    format_nameserver_value(&servers)
                ));
                ok += 1;
            }
            Err(e) => {
                log_line(&format!(
                    "dns override {} ({}) FAILED: {}",
                    it.guid, it.alias, e
                ));
                err += 1;
            }
        }
    }
    (ok, err)
}

/// Restore the saved DNS values. Falls back to removing the legacy hijack
/// value when upgrading from a service version that did not save snapshots.
pub fn remove_override(gateway: &str) -> (usize, usize) {
    let g = gateway.trim();
    if g.is_empty() || g == "-" {
        return (0, 0);
    }
    if let Some(restored) = restore_saved_snapshot() {
        return restored;
    }

    // Compatibility cleanup for an override created by an older service that
    // did not persist a snapshot.
    let list = match enumerate_interfaces() {
        Ok(l) => l,
        Err(e) => {
            log_line(&format!("remove_override: enumerate failed: {}", e));
            return (0, 1);
        }
    };
    let mut ok = 0usize;
    let mut err = 0usize;
    for it in list {
        if !it.is_candidate_for_dns_override() {
            continue;
        }
        let servers = nameserver_without_gateway(&it.current_dns, g);
        match set_interface_dns(&it.guid, &servers) {
            Ok(()) => {
                log_line(&format!(
                    "dns remove {} ({}) -> {}",
                    it.guid,
                    it.alias,
                    format_nameserver_value(&servers)
                ));
                ok += 1;
            }
            Err(e) => {
                log_line(&format!(
                    "dns remove {} ({}) FAILED: {}",
                    it.guid, it.alias, e
                ));
                err += 1;
            }
        }
    }
    (ok, err)
}

/// Crash-path fallback when the gateway is unknown.
pub fn restore_all() -> (usize, usize) {
    restore_saved_snapshot().unwrap_or((0, 0))
}

// =========================== service log =============================

/// Append a line to `%PROGRAMDATA%\AureStream\service\service.log`, falling back to
/// `%TEMP%\aurestream-service.log` if ProgramData is not writable. Silently ignores
/// errors (failed logging must never kill the service).
pub fn log_line(msg: &str) {
    use std::io::Write;
    let path = match std::env::var_os("ProgramData") {
        Some(pd) => {
            let mut p = std::path::PathBuf::from(pd);
            p.push("AureStream");
            p.push("service");
            let _ = std::fs::create_dir_all(&p);
            p.push("service.log");
            p
        }
        None => std::env::temp_dir().join("aurestream-service.log"),
    };
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
    {
        let _ = writeln!(f, "[{}] {}", stamp(), msg);
    }
}

fn stamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_else(|_| "?".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    // ------------------------------ normalize_guid ------------------------------

    #[test]
    fn normalize_guid_accepts_unbraced_and_uppercases() {
        assert_eq!(
            normalize_guid("550e8400-e29b-41d4-a716-446655440000"),
            Some("{550E8400-E29B-41D4-A716-446655440000}".to_string())
        );
    }

    #[test]
    fn normalize_guid_accepts_braced_form() {
        assert_eq!(
            normalize_guid("{550e8400-e29b-41d4-a716-446655440000}"),
            Some("{550E8400-E29B-41D4-A716-446655440000}".to_string())
        );
    }

    #[test]
    fn normalize_guid_rejects_garbage() {
        assert!(normalize_guid("").is_none());
        assert!(normalize_guid("bad").is_none());
        assert!(normalize_guid("550e8400-e29b-41d4-a716-44665544000Z").is_none());
        assert!(normalize_guid("550e8400e29b41d4a716446655440000").is_none());
        assert!(normalize_guid("550e8400-e29b-41d4-a716-4466554").is_none());
    }

    // ------------------------------ is_tun_alias -------------------------------

    #[test]
    fn tun_alias_detects_known_tun_adapters() {
        assert!(is_tun_alias("sing-box"));
        assert!(is_tun_alias("sing-box tun"));
        assert!(is_tun_alias("Xray Tunnel"));
        assert!(is_tun_alias("WinTUN Userspace Tunnel"));
        assert!(is_tun_alias("wintun"));
        assert!(is_tun_alias("TAP-Windows Adapter V9"));
        assert!(is_tun_alias("AureStream TUN"));
        assert!(is_tun_alias("utun0"));
    }

    #[test]
    fn tun_alias_is_case_insensitive() {
        assert!(is_tun_alias("WINTUN"));
        assert!(is_tun_alias("SING-BOX"));
        assert!(is_tun_alias("XRAY"));
    }

    #[test]
    fn tun_alias_skips_physical_adapters() {
        assert!(!is_tun_alias("Wi-Fi"));
        assert!(!is_tun_alias("Ethernet"));
        assert!(!is_tun_alias("以太网"));
        assert!(!is_tun_alias("Local Area Connection"));
    }

    #[test]
    fn virtual_alias_skips_non_physical_adapters() {
        assert!(is_virtual_or_tun_alias(
            "vEthernet (WSL (Hyper-V firewall))"
        ));
        assert!(is_virtual_or_tun_alias("VMware Network Adapter VMnet8"));
        assert!(is_virtual_or_tun_alias("WireGuard Tunnel"));
        assert!(!is_virtual_or_tun_alias("以太网"));
        assert!(!is_virtual_or_tun_alias("Wi-Fi"));
    }

    // ------------------------------ nameserver format -------------------------

    #[test]
    fn nameserver_format_joins_and_trims() {
        assert_eq!(
            format_nameserver_value(&["1.1.1.1", " 2.2.2.2 "]),
            "1.1.1.1,2.2.2.2"
        );
    }

    #[test]
    fn nameserver_format_drops_empty_entries() {
        assert_eq!(format_nameserver_value(&[]), "");
        assert_eq!(format_nameserver_value(&["", "  "]), "");
        assert_eq!(format_nameserver_value(&["", "8.8.8.8", ""]), "8.8.8.8");
    }

    #[test]
    fn nameserver_with_gateway_first_preserves_existing_dns() {
        let servers = nameserver_with_gateway_first("8.8.8.8,1.1.1.1", "198.18.0.1");
        assert_eq!(
            format_nameserver_value(&servers),
            "198.18.0.1,8.8.8.8,1.1.1.1"
        );
    }

    #[test]
    fn nameserver_with_gateway_first_deduplicates_gateway() {
        let servers = nameserver_with_gateway_first("8.8.8.8,198.18.0.1,1.1.1.1", "198.18.0.1");
        assert_eq!(
            format_nameserver_value(&servers),
            "198.18.0.1,8.8.8.8,1.1.1.1"
        );
    }

    #[test]
    fn nameserver_tun_hijack_only_drops_domestic_fallbacks() {
        // apply_override must not keep 114 alongside the hijack IP.
        assert_eq!(
            format_nameserver_value(&nameserver_tun_hijack_only("1.1.1.1")),
            "1.1.1.1"
        );
        assert!(nameserver_tun_hijack_only("").is_empty());
        assert!(nameserver_tun_hijack_only("-").is_empty());
    }

    #[test]
    fn nameserver_without_gateway_removes_only_gateway() {
        let servers = nameserver_without_gateway("198.18.0.1,8.8.8.8,1.1.1.1", "198.18.0.1");
        assert_eq!(format_nameserver_value(&servers), "8.8.8.8,1.1.1.1");
    }

    // ------------------------------ has_nonzero_ip ----------------------------

    #[test]
    fn has_nonzero_ip_rejects_blank_and_zeros() {
        assert!(!has_nonzero_ip(""));
        assert!(!has_nonzero_ip("0.0.0.0"));
        assert!(!has_nonzero_ip("0.0.0.0\0"));
        assert!(!has_nonzero_ip("0.0.0.0 0.0.0.0"));
    }

    #[test]
    fn has_nonzero_ip_accepts_real_addresses() {
        assert!(has_nonzero_ip("192.168.1.2"));
        // Registry multi-sz values may have embedded NULs.
        assert!(has_nonzero_ip("0.0.0.0\u{0}192.168.1.2"));
        assert!(has_nonzero_ip("10.0.0.1,8.8.8.8"));
    }

    // ------------------------------ path helpers ------------------------------

    #[test]
    fn interface_reg_path_matches_expected_shape() {
        let p = interface_reg_path("{ABC}");
        assert!(p.ends_with(r"Interfaces\{ABC}"));
        assert!(p.starts_with("SYSTEM"));
    }

    #[test]
    fn connection_reg_path_uses_net_class_guid() {
        let p = connection_reg_path("{XYZ}");
        assert!(p.contains(NET_CLASS_GUID));
        assert!(p.ends_with(r"\{XYZ}\Connection"));
    }

    // ------------------------------ apply_override noop ----------------------

    #[test]
    fn apply_override_with_empty_gateway_is_noop() {
        // Must not touch the registry when gateway is blank.
        assert_eq!(apply_override("", None), (0, 0));
        assert_eq!(apply_override("-", None), (0, 0));
        assert_eq!(apply_override("  ", None), (0, 0));
    }

    // ------------------------------ enumerate integration --------------------

    /// Read-only registry access; safe on any dev machine.
    #[test]
    fn enumerate_interfaces_returns_something_on_real_host() {
        let list = enumerate_interfaces().expect("enumerate");
        assert!(
            !list.is_empty(),
            "expected at least one Tcpip interface entry"
        );
        assert!(
            list.iter().any(|i| !i.alias.is_empty()),
            "expected at least one interface with a friendly name"
        );
    }
}
