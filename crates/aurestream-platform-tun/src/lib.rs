//! OS-level TUN capture (virtual NIC).
//!
//! Phase 0/1: probe + clear error when privilege helper is missing.
//! Full Windows SCM / macOS SMJobBless / Linux pkexec helper ports land next.

use std::fmt;
use std::path::Path;

use serde::{Deserialize, Serialize};

/// Installation / readiness of the elevated TUN helper.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TunServiceState {
    /// Helper / service not installed or not usable in this build.
    NotInstalled,
    /// Helper present; may start TUN.
    Ready,
    /// TUN capture appears active (best-effort).
    Running,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TunError {
    pub code: String,
    pub message: String,
}

impl TunError {
    pub fn not_installed(message: impl Into<String>) -> Self {
        Self {
            code: "tun_not_installed".into(),
            message: message.into(),
        }
    }

    pub fn failed(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }
}

impl fmt::Display for TunError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for TunError {}

/// Probe elevated TUN helper availability (no side effects).
pub fn probe() -> TunServiceState {
    #[cfg(target_os = "windows")]
    {
        windows::probe()
    }
    #[cfg(target_os = "macos")]
    {
        macos::probe()
    }
    #[cfg(target_os = "linux")]
    {
        linux::probe()
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        TunServiceState::NotInstalled
    }
}

/// Ensure helper is installed when possible. Phase 0: report not installed.
pub fn ensure_installed() -> Result<TunServiceState, TunError> {
    let state = probe();
    match state {
        TunServiceState::Ready | TunServiceState::Running => Ok(state),
        TunServiceState::NotInstalled => Err(not_installed_error()),
    }
}

/// Start TUN capture around an already-written Xray config.
///
/// Phase 0/1: privilege helpers are not yet bundled — returns a clear error so
/// the shell can surface a dialog. Config dialect with `tun-in` is still produced
/// by `aurestream-engine` for when helpers land.
pub fn start_tun(
    _config_path: &Path,
    _core_path: &Path,
    _dns_hijack: Option<&str>,
) -> Result<(), TunError> {
    match probe() {
        TunServiceState::NotInstalled => Err(not_installed_error()),
        TunServiceState::Ready | TunServiceState::Running => {
            // Full elevated start lands with helper ports (Windows SCM / macOS XPC / Linux pkexec).
            Err(TunError::failed(
                "tun_start_unimplemented",
                "虚拟网卡捕获层尚未完成本地提权启动，请暂时使用系统代理。",
            ))
        }
    }
}

/// Stop TUN capture and restore DNS (best-effort).
pub fn stop_tun() -> Result<(), TunError> {
    #[cfg(target_os = "windows")]
    {
        return windows::stop_tun();
    }
    #[cfg(target_os = "macos")]
    {
        return macos::stop_tun();
    }
    #[cfg(target_os = "linux")]
    {
        return linux::stop_tun();
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        Ok(())
    }
}

fn not_installed_error() -> TunError {
    #[cfg(target_os = "windows")]
    {
        TunError::not_installed(
            "虚拟网卡服务尚未安装。请使用带 TUN 组件的安装包，或暂时切换为系统代理。",
        )
    }
    #[cfg(target_os = "macos")]
    {
        TunError::not_installed(
            "macOS 虚拟网卡需要已签名安装包中的特权 Helper。当前环境不可用，请使用系统代理。",
        )
    }
    #[cfg(target_os = "linux")]
    {
        TunError::not_installed(
            "Linux 虚拟网卡需要 deb/rpm 安装的 polkit Helper。当前环境不可用，请使用系统代理。",
        )
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        TunError::not_installed("当前平台不支持虚拟网卡。")
    }
}

#[cfg(target_os = "windows")]
mod windows {
    use super::*;

    pub fn probe() -> TunServiceState {
        // Phase 1 will query SCM for AureStreamTunService.
        TunServiceState::NotInstalled
    }

    pub fn stop_tun() -> Result<(), TunError> {
        Ok(())
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use super::*;

    pub fn probe() -> TunServiceState {
        TunServiceState::NotInstalled
    }

    pub fn stop_tun() -> Result<(), TunError> {
        Ok(())
    }
}

#[cfg(target_os = "linux")]
mod linux {
    use super::*;

    pub fn probe() -> TunServiceState {
        use std::path::Path;
        // deb/rpm install path from legacy packaging.
        if Path::new("/usr/lib/AureStream/aurestream-tun-helper").is_file() {
            TunServiceState::Ready
        } else {
            TunServiceState::NotInstalled
        }
    }

    pub fn stop_tun() -> Result<(), TunError> {
        Ok(())
    }
}
