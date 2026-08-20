//! OS system proxy set/clear for AureStream MVP.
//!
//! # API
//! - [`is_supported`] — `true` on Windows / macOS / Linux
//! - [`set_system_proxy`] — enable HTTP(S)/SOCKS system proxy at `host:port`
//! - [`clear_system_proxy`] — disable the system proxy
//!
//! # Platforms
//! | OS | Backend |
//! |---|---|
//! | Windows | WinINET + RAS (LAN + dial-up/VPN connections) |
//! | macOS | `networksetup` on **all enabled** network services |
//! | Linux | GNOME `gsettings` and/or KDE `kwriteconfig` (with fallback) |
//!
//! # Manual verification
//! 1. Call `set_system_proxy("127.0.0.1", 17890)`.
//! 2. Confirm OS proxy UI shows `127.0.0.1:17890` (HTTP/HTTPS/SOCKS).
//! 3. Call `clear_system_proxy()` and confirm proxy is off (direct).

mod error;
mod helpers;

#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "linux")]
mod linux;

pub use error::ProxyError;
pub use helpers::{default_bypass, format_proxy_addr, format_windows_proxy_server};

/// Whether this build target has a system-proxy backend.
///
/// MVP desktop targets (Windows, macOS, Linux) all return `true`.
pub fn is_supported() -> bool {
    cfg!(any(
        target_os = "windows",
        target_os = "macos",
        target_os = "linux",
    ))
}

/// Enable the OS system proxy pointing at `host:port`.
///
/// On macOS this is applied to every enabled network service. On Linux the
/// preferred desktop backend is tried first, then the alternate.
pub fn set_system_proxy(host: &str, port: u16) -> Result<(), ProxyError> {
    log::info!("set_system_proxy {host}:{port}");
    let result = {
        #[cfg(target_os = "windows")]
        {
            windows::set_system_proxy(host, port)
        }
        #[cfg(target_os = "macos")]
        {
            macos::set_system_proxy(host, port)
        }
        #[cfg(target_os = "linux")]
        {
            linux::set_system_proxy(host, port)
        }
        #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
        {
            let _ = (host, port);
            Err(ProxyError::Unsupported("this OS has no system-proxy backend"))
        }
    };
    match &result {
        Ok(()) => log::info!("set_system_proxy ok {host}:{port}"),
        Err(e) => log::error!("set_system_proxy failed: {e}"),
    }
    result
}

/// Disable the OS system proxy.
pub fn clear_system_proxy() -> Result<(), ProxyError> {
    log::info!("clear_system_proxy");
    let result = {
        #[cfg(target_os = "windows")]
        {
            windows::clear_system_proxy()
        }
        #[cfg(target_os = "macos")]
        {
            macos::clear_system_proxy()
        }
        #[cfg(target_os = "linux")]
        {
            linux::clear_system_proxy()
        }
        #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
        {
            Err(ProxyError::Unsupported("this OS has no system-proxy backend"))
        }
    };
    match &result {
        Ok(()) => log::info!("clear_system_proxy ok"),
        Err(e) => log::error!("clear_system_proxy failed: {e}"),
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn desktop_targets_report_supported() {
        assert!(is_supported());
    }
}
