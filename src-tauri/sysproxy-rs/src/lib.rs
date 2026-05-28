//! Cross-platform system proxy configuration library.
//!
//! Supports Windows, macOS and Linux (GNOME/KDE).
//! On Windows, uses WinINet API with RAS connection enumeration for maximum compatibility.
//! On macOS, uses `networksetup` command.
//! On Linux, uses `gsettings` (GNOME) or `kreadconfig`/`kwriteconfig` (KDE).

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

pub mod utils;

/// Represents a system HTTP/SOCKS proxy configuration.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Sysproxy {
    pub enable: bool,
    pub host: String,
    pub port: u16,
    pub bypass: String,
}

/// Represents a system auto-proxy (PAC) configuration.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Autoproxy {
    pub enable: bool,
    pub url: String,
}

#[derive(thiserror::Error, Debug)]
pub enum Error {
    #[error("failed to parse string `{0}`")]
    ParseStr(String),

    #[error(transparent)]
    Io(#[from] std::io::Error),

    #[error("failed to get default network interface")]
    NetworkInterface,

    #[error("failed to set proxy for this environment")]
    NotSupport,

    #[cfg(target_os = "linux")]
    #[error(transparent)]
    Xdg(#[from] xdg::BaseDirectoriesError),

    #[cfg(target_os = "windows")]
    #[error("system call failed: {0}")]
    SystemCall(#[from] ::windows::core::Error),
}

pub type Result<T> = std::result::Result<T, Error>;

/// Represents a UWP app container that can be exempted from proxy loopback restrictions.
///
/// Windows UWP apps are sandboxed and cannot reach loopback addresses by default.
/// Loopback exemption allows them to connect through a local proxy.
#[cfg(target_os = "windows")]
#[derive(Debug, Default, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct AppContainer {
    /// AppContainer SID string (e.g. `S-1-15-2-…`).
    pub sid: String,
    /// Internal package name (e.g. `microsoft.windowscommunicationsapps_8wekyb3d8bbwe`).
    pub name: String,
    /// Human-readable display name.
    pub display_name: String,
    /// Whether this container is currently in the loopback proxy exemption list.
    pub exempted: bool,
}

#[cfg(target_os = "windows")]
impl AppContainer {
    /// Returns the current UWP loopback proxy exemption list.
    pub fn get_exemption() -> Result<Vec<AppContainer>> {
        crate::windows::get_uwp_exemption()
    }

    /// Replaces the UWP loopback proxy exemption list with the given SID strings
    /// and returns the updated list.
    pub fn set_exemption(sids: &[String]) -> Result<Vec<AppContainer>> {
        crate::windows::set_uwp_exemption(sids)
    }
}

impl Sysproxy {
    /// Returns `true` if the current platform is supported.
    pub fn is_support() -> bool {
        cfg!(any(
            target_os = "linux",
            target_os = "macos",
            target_os = "windows",
        ))
    }
}

impl Autoproxy {
    /// Returns `true` if the current platform is supported.
    pub fn is_support() -> bool {
        cfg!(any(
            target_os = "linux",
            target_os = "macos",
            target_os = "windows",
        ))
    }
}
