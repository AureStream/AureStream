//! OS-level TUN capture (virtual NIC).
//!
//! - **Linux**: systemd `aurestream-tun.socket` + helper over a Unix socket
//!   (`SO_PEERCRED`). Install once via deb/rpm / `install-linux-tun-helper.sh`.
//! - **Windows**: SCM service `AureStreamTunService` (`tun-service.exe`, one-time UAC).
//! - **macOS**: SMJobBless helper `com.root.aurestream.helper` (signed bundle).

use std::fmt;
use std::path::Path;

use serde::{Deserialize, Serialize};

mod config_patch;

/// Installation / readiness of the elevated TUN helper.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TunServiceState {
    NotInstalled,
    Ready,
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
    #[cfg(target_os = "linux")]
    {
        return linux::probe();
    }
    #[cfg(target_os = "windows")]
    {
        return windows::probe();
    }
    #[cfg(target_os = "macos")]
    {
        return macos::probe();
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        TunServiceState::NotInstalled
    }
}

/// Ensure elevated helper/service is installed when possible.
///
/// - Linux: helper must already be on disk (deb/rpm / install script).
/// - Windows: may prompt UAC once to install/upgrade `tun-service`.
/// - macOS: may prompt once via SMJobBless to install privileged helper.
pub fn ensure_installed() -> Result<TunServiceState, TunError> {
    #[cfg(target_os = "windows")]
    {
        return windows::ensure_installed();
    }
    #[cfg(target_os = "macos")]
    {
        return macos::ensure_installed();
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let state = probe();
        match state {
            TunServiceState::Ready | TunServiceState::Running => Ok(state),
            TunServiceState::NotInstalled => Err(not_installed_error()),
        }
    }
}

/// Start TUN capture: elevated core + DNS hijack after readiness.
///
/// Caller must NOT also spawn a user-space core (`Engine::start`). After Ok,
/// mixed/API ports should accept connections.
///
/// `dns_hijack`: OS DNS override target (default `1.1.1.1`). Do not use the
/// TUN gateway IP — host DNS to `198.18.0.1:53` is refused.
/// `asset_dir`: geo assets (and on Windows, optionally `wintun.dll`).
pub fn start_tun(
    config_path: &Path,
    core_path: &Path,
    dns_hijack: Option<&str>,
    asset_dir: Option<&Path>,
) -> Result<(), TunError> {
    let dns = dns_hijack.unwrap_or("1.1.1.1");
    #[cfg(target_os = "linux")]
    {
        return linux::start_tun(config_path, core_path, dns, asset_dir);
    }
    #[cfg(target_os = "windows")]
    {
        return windows::start_tun(config_path, core_path, dns, asset_dir);
    }
    #[cfg(target_os = "macos")]
    {
        return macos::start_tun(config_path, core_path, dns, asset_dir);
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
    {
        let _ = (config_path, core_path, dns, asset_dir);
        Err(not_installed_error())
    }
}

/// Windows service binary entry helpers (used by `tun-service` bin).
#[cfg(target_os = "windows")]
pub fn windows_scm_ensure_installed(
    bundled: &Path,
    core: &Path,
    assets: Option<&Path>,
) -> Result<(), String> {
    windows::scm::ensure_installed(bundled, core, assets)
}

#[cfg(target_os = "windows")]
pub fn windows_scm_uninstall() -> Result<(), String> {
    windows::scm::uninstall()
}

/// Windows: orphan cleanup entry for scheduled task / CLI (`tun-service orphan-check`).
/// Returns `true` if the service was uninstalled because the main app is gone.
#[cfg(target_os = "windows")]
pub fn windows_orphan_check() -> bool {
    windows::scm::orphan_check_and_cleanup()
}

#[cfg(target_os = "windows")]
pub fn windows_service_run_dispatcher() -> i32 {
    windows::service::run_dispatcher()
}

/// Elevated uninstall of the Windows TUN SCM service (UAC).
#[cfg(target_os = "windows")]
pub fn windows_uninstall_service() -> Result<(), TunError> {
    let bundled = windows::resolve_tun_service_path()?;
    windows::elevate_uninstall(&bundled)
}

/// Uninstall the elevated TUN helper/service (best-effort stop first).
///
/// - **macOS**: SMJobBless helper via XPC (falls back to admin shell).
/// - **Windows**: elevated `tun-service uninstall` (UAC).
/// - **Linux**: `pkexec … uninstall` (also used by deb postrm).
pub fn uninstall_elevated() -> Result<(), TunError> {
    let _ = stop_tun();
    #[cfg(target_os = "macos")]
    {
        return macos::uninstall_helper().map_err(|e| TunError::failed("helper_uninstall", e));
    }
    #[cfg(target_os = "windows")]
    {
        return windows_uninstall_service();
    }
    #[cfg(target_os = "linux")]
    {
        return linux::uninstall_helper();
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        Err(TunError::failed(
            "helper_uninstall",
            "当前平台没有可卸载的虚拟网卡组件。",
        ))
    }
}

/// Stop TUN capture and restore DNS (best-effort).
pub fn stop_tun() -> Result<(), TunError> {
    #[cfg(target_os = "linux")]
    {
        return linux::stop_tun();
    }
    #[cfg(target_os = "windows")]
    {
        return windows::stop_tun();
    }
    #[cfg(target_os = "macos")]
    {
        return macos::stop_tun();
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
            "Linux 虚拟网卡需要 deb/rpm 安装的 systemd 服务（aurestream-tun.socket）。也可运行 scripts/install-linux-tun-helper.sh 安装开发用 helper。",
        )
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        TunError::not_installed("当前平台不支持虚拟网卡。")
    }
}

#[cfg(target_os = "linux")]
mod linux;

/// Linux helper binary entry (`aurestream-tun-helper serve|uninstall|...`).
#[cfg(target_os = "linux")]
pub fn linux_helper_main(args: &[String]) -> i32 {
    linux::helper_main(args)
}

#[cfg(target_os = "windows")]
mod windows;

#[cfg(target_os = "macos")]
mod macos;
