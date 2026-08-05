//! OS system proxy set/clear for AureStream MVP.
//!
//! # API
//! - [`set_system_proxy`] — enable HTTP(S)/SOCKS system proxy at `host:port`
//! - [`clear_system_proxy`] — disable the system proxy
//!
//! Windows (primary): WinINET + RAS. macOS: `networksetup`. Linux: GNOME
//! `gsettings` or KDE `kwriteconfig`.
//!
//! # Manual verification (Windows / WinINET)
//! On a Windows host (e.g. `10.20.41.26`):
//! 1. Call `set_system_proxy("127.0.0.1", 17890)`.
//! 2. Confirm IE / WinINET / Settings → Proxy shows `127.0.0.1:17890`.
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
pub use helpers::{default_bypass, format_proxy_addr};

/// Enable the OS system proxy pointing at `host:port`.
pub fn set_system_proxy(host: &str, port: u16) -> Result<(), ProxyError> {
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
}

/// Disable the OS system proxy.
pub fn clear_system_proxy() -> Result<(), ProxyError> {
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
}
