//! macOS system proxy via `networksetup` (HTTP/HTTPS/SOCKS + bypass).
//!
//! Applies settings to **every enabled** network service so Wi-Fi / Ethernet /
//! USB tethering all pick up the proxy (not only the first listed service).

use std::process::Command;
use std::str::from_utf8;

use crate::helpers::{default_bypass, require_host};
use crate::ProxyError;

fn networksetup() -> Command {
    Command::new("networksetup")
}

/// Enabled (non-disabled) hardware/virtual services from `networksetup`.
///
/// Disabled services are prefixed with `*` in `-listallnetworkservices` output.
fn list_enabled_services() -> Result<Vec<String>, ProxyError> {
    let output = networksetup().arg("-listallnetworkservices").output()?;
    if !output.status.success() {
        return Err(ProxyError::Platform(
            "networksetup -listallnetworkservices failed".into(),
        ));
    }
    let stdout = from_utf8(&output.stdout)
        .map_err(|_| ProxyError::Platform("invalid utf-8 from networksetup".into()))?;

    let mut services = Vec::new();
    for (i, line) in stdout.lines().enumerate() {
        // First line is the tip: "An asterisk (*) denotes that a network service is disabled."
        if i == 0 {
            continue;
        }
        let line = line.trim();
        if line.is_empty() || line.starts_with('*') {
            continue;
        }
        services.push(line.to_string());
    }

    if services.is_empty() {
        return Err(ProxyError::Platform("no enabled network service found".into()));
    }
    Ok(services)
}

fn set_proxy_type(
    service: &str,
    kind: &str,
    host: &str,
    port: u16,
    enable: bool,
) -> Result<(), ProxyError> {
    let port_s = port.to_string();
    let set = format!("-set{kind}");
    let state = format!("-set{kind}state");
    let on_off = if enable { "on" } else { "off" };

    let status = networksetup()
        .args([set.as_str(), service, host, port_s.as_str()])
        .status()?;
    if !status.success() {
        return Err(ProxyError::Platform(format!(
            "failed {set} on service `{service}`"
        )));
    }

    let status = networksetup()
        .args([state.as_str(), service, on_off])
        .status()?;
    if !status.success() {
        return Err(ProxyError::Platform(format!(
            "failed {state} on service `{service}`"
        )));
    }
    Ok(())
}

fn set_bypass(service: &str, bypass: &str) -> Result<(), ProxyError> {
    let domains: Vec<&str> = bypass
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .collect();
    let mut args = vec!["-setproxybypassdomains", service];
    args.extend(domains.iter().copied());
    let status = networksetup().args(&args).status()?;
    if !status.success() {
        return Err(ProxyError::Platform(format!(
            "failed -setproxybypassdomains on service `{service}`"
        )));
    }
    Ok(())
}

fn disable_proxy_types(service: &str) -> Result<(), ProxyError> {
    for kind in ["webproxy", "securewebproxy", "socksfirewallproxy"] {
        let state = format!("-set{kind}state");
        let status = networksetup()
            .args([state.as_str(), service, "off"])
            .status()?;
        if !status.success() {
            return Err(ProxyError::Platform(format!(
                "failed {state} on service `{service}`"
            )));
        }
    }
    Ok(())
}

fn apply_to_service(service: &str, host: &str, port: u16) -> Result<(), ProxyError> {
    set_proxy_type(service, "webproxy", host, port, true)?;
    set_proxy_type(service, "securewebproxy", host, port, true)?;
    set_proxy_type(service, "socksfirewallproxy", host, port, true)?;
    set_bypass(service, default_bypass())?;
    Ok(())
}

/// Run `op` on every enabled service. Succeeds if **at least one** service
/// applies cleanly (virtual adapters like third-party VPN may reject writes).
fn for_each_service<F>(op: F) -> Result<(), ProxyError>
where
    F: Fn(&str) -> Result<(), ProxyError>,
{
    let services = list_enabled_services()?;
    let mut last_err: Option<ProxyError> = None;
    let mut ok = 0usize;

    for service in &services {
        match op(service) {
            Ok(()) => ok += 1,
            Err(e) => last_err = Some(e),
        }
    }

    if ok > 0 {
        Ok(())
    } else {
        Err(last_err.unwrap_or_else(|| {
            ProxyError::Platform("no network service accepted proxy changes".into())
        }))
    }
}

pub fn set_system_proxy(host: &str, port: u16) -> Result<(), ProxyError> {
    let host = require_host(host)?;
    for_each_service(|service| apply_to_service(service, host, port))
}

pub fn clear_system_proxy() -> Result<(), ProxyError> {
    for_each_service(disable_proxy_types)
}
