//! macOS system proxy via `networksetup` (HTTP/HTTPS/SOCKS + bypass).

use std::process::Command;
use std::str::from_utf8;

use crate::helpers::{default_bypass, require_host};
use crate::ProxyError;

fn networksetup() -> Command {
    Command::new("networksetup")
}

fn default_service() -> Result<String, ProxyError> {
    let output = networksetup().arg("-listallnetworkservices").output()?;
    if !output.status.success() {
        return Err(ProxyError::Platform(
            "networksetup -listallnetworkservices failed".into(),
        ));
    }
    let stdout = from_utf8(&output.stdout)
        .map_err(|_| ProxyError::Platform("invalid utf-8 from networksetup".into()))?;
    let mut lines = stdout.lines();
    lines.next(); // tip line
    lines
        .map(str::trim)
        .find(|line| !line.is_empty() && !line.starts_with('*'))
        .map(str::to_string)
        .ok_or_else(|| ProxyError::Platform("no network service found".into()))
}

fn set_proxy_type(service: &str, kind: &str, host: &str, port: u16, enable: bool) -> Result<(), ProxyError> {
    let port_s = port.to_string();
    let set = format!("-set{kind}");
    let state = format!("-set{kind}state");
    let on_off = if enable { "on" } else { "off" };

    let status = networksetup()
        .args([set.as_str(), service, host, port_s.as_str()])
        .status()?;
    if !status.success() {
        return Err(ProxyError::Platform(format!("failed {set}")));
    }

    let status = networksetup()
        .args([state.as_str(), service, on_off])
        .status()?;
    if !status.success() {
        return Err(ProxyError::Platform(format!("failed {state}")));
    }
    Ok(())
}

fn set_bypass(service: &str, bypass: &str) -> Result<(), ProxyError> {
    let domains: Vec<&str> = bypass.split(',').map(str::trim).filter(|s| !s.is_empty()).collect();
    let mut args = vec!["-setproxybypassdomains", service];
    args.extend(domains.iter().copied());
    let status = networksetup().args(&args).status()?;
    if !status.success() {
        return Err(ProxyError::Platform(
            "failed -setproxybypassdomains".into(),
        ));
    }
    Ok(())
}

pub fn set_system_proxy(host: &str, port: u16) -> Result<(), ProxyError> {
    let host = require_host(host)?;
    let service = default_service()?;
    set_proxy_type(&service, "webproxy", host, port, true)?;
    set_proxy_type(&service, "securewebproxy", host, port, true)?;
    set_proxy_type(&service, "socksfirewallproxy", host, port, true)?;
    set_bypass(&service, default_bypass())?;
    Ok(())
}

pub fn clear_system_proxy() -> Result<(), ProxyError> {
    let service = default_service()?;
    // Disable without changing stored host/port.
    for kind in ["webproxy", "securewebproxy", "socksfirewallproxy"] {
        let state = format!("-set{kind}state");
        let status = networksetup()
            .args([state.as_str(), service.as_str(), "off"])
            .status()?;
        if !status.success() {
            return Err(ProxyError::Platform(format!("failed {state}")));
        }
    }
    Ok(())
}
