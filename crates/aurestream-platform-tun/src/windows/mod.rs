//! Windows TUN via SCM service `AureStreamTunService` (one-time UAC install).
//!
//! Client (non-elevated): probe / ensure_installed / start_service_with_args / stop.
//! Service binary (`tun-service.exe`): elevated install + ServiceMain (spawn core + DNS).

#![cfg(target_os = "windows")]

mod dns;
mod elevate;
mod outbound_if;
pub mod scm;
pub mod service;

use crate::config_patch;

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use super::{not_installed_error, TunError, TunServiceState};

pub const SERVICE_NAME: &str = "AureStreamTunService";
pub const SERVICE_DISPLAY_NAME: &str = "AureStream TUN Service";

const READY_TIMEOUT: Duration = Duration::from_secs(25);
const POLL: Duration = Duration::from_millis(150);

pub fn probe() -> TunServiceState {
    match scm::query_state() {
        scm::QueriedState::NotInstalled => TunServiceState::NotInstalled,
        scm::QueriedState::Running | scm::QueriedState::StartPending => TunServiceState::Running,
        scm::QueriedState::Stopped | scm::QueriedState::StopPending | scm::QueriedState::Other => {
            TunServiceState::Ready
        }
    }
}

/// Resolve bundled `tun-service.exe` (Tauri externalBin / next to app / env).
pub fn resolve_tun_service_path() -> Result<PathBuf, TunError> {
    if let Ok(p) = std::env::var("AURESTREAM_TUN_SERVICE_PATH") {
        let path = PathBuf::from(p);
        if path.is_file() {
            return Ok(path);
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for name in [
                "tun-service.exe",
                "tun-service-x86_64-pc-windows-msvc.exe",
                "tun-service-aarch64-pc-windows-msvc.exe",
            ] {
                let c = dir.join(name);
                if c.is_file() {
                    return Ok(c);
                }
            }
            // Tauri sometimes nests sidecars
            if let Ok(rd) = std::fs::read_dir(dir) {
                for e in rd.flatten() {
                    let n = e.file_name();
                    let s = n.to_string_lossy();
                    if s.starts_with("tun-service") && s.ends_with(".exe") && e.path().is_file() {
                        return Ok(e.path());
                    }
                }
            }
        }
    }

    for dir in [
        PathBuf::from("src-tauri/binaries"),
        PathBuf::from("../src-tauri/binaries"),
        PathBuf::from("../../src-tauri/binaries"),
    ] {
        if let Ok(rd) = std::fs::read_dir(&dir) {
            for e in rd.flatten() {
                let n = e.file_name();
                let s = n.to_string_lossy();
                if s.starts_with("tun-service") && s.ends_with(".exe") && e.path().is_file() {
                    return Ok(e.path());
                }
            }
        }
    }

    Err(TunError::not_installed(
        "未找到 tun-service.exe。请使用带 TUN 组件的安装包，或运行 pnpm build-tun 后重试。",
    ))
}

fn resolve_bundled_core_path() -> Result<PathBuf, TunError> {
    if let Ok(p) = std::env::var("AURESTREAM_CORE_PATH") {
        let path = PathBuf::from(p);
        if path.is_file() {
            return Ok(path);
        }
    }

    let mut dirs = Vec::new();
    if let Ok(service) = resolve_tun_service_path() {
        if let Some(dir) = service.parent() {
            dirs.push(dir.to_path_buf());
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            dirs.push(dir.to_path_buf());
        }
    }
    dirs.extend([
        PathBuf::from("src-tauri/binaries"),
        PathBuf::from("../src-tauri/binaries"),
        PathBuf::from("../../src-tauri/binaries"),
    ]);
    let target_name = match std::env::consts::ARCH {
        "aarch64" => Some("aurestream-core-aarch64-pc-windows-msvc.exe"),
        "x86_64" => Some("aurestream-core-x86_64-pc-windows-msvc.exe"),
        _ => None,
    };
    for dir in &dirs {
        for name in target_name.into_iter().chain(["aurestream-core.exe"]) {
            let candidate = dir.join(name);
            if candidate.is_file() {
                return Ok(candidate);
            }
        }
    }
    for dir in dirs {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
                if name.starts_with("aurestream-core")
                    && name.ends_with(".exe")
                    && entry.path().is_file()
                {
                    return Ok(entry.path());
                }
            }
        }
    }
    Err(TunError::not_installed(
        "未找到 aurestream-core.exe，请重新下载内核后重试。",
    ))
}

fn resolve_asset_dir_for_core(core: &Path) -> Option<PathBuf> {
    let parent = core.parent()?;
    [
        parent.to_path_buf(),
        parent.join("resources"),
        parent.parent()?.join("resources"),
        PathBuf::from("src-tauri/resources"),
    ]
    .into_iter()
    .find(|dir| dir.join("wintun.dll").is_file())
}

/// One-time UAC install / upgrade of the SCM service when needed.
pub fn ensure_installed() -> Result<TunServiceState, TunError> {
    let core = resolve_bundled_core_path()?;
    let assets = resolve_asset_dir_for_core(&core);
    ensure_installed_with_core(&core, assets.as_deref())
}

fn ensure_installed_with_core(
    core: &Path,
    asset_dir: Option<&Path>,
) -> Result<TunServiceState, TunError> {
    let bundled = resolve_tun_service_path()?;
    let service_freshness = scm::check_freshness(&bundled);
    let core_freshness = scm::check_core_freshness(core);
    let wintun_installed = scm::program_data_dir().join("wintun.dll").is_file();
    match (service_freshness, core_freshness, wintun_installed) {
        (scm::Freshness::UpToDate, scm::Freshness::UpToDate, true) => {
            log::info!("[tun/win] tun-service up to date");
        }
        (scm::Freshness::MissingBinary, _, _) => {
            return Err(TunError::not_installed(format!(
                "bundled tun-service missing: {}",
                bundled.display()
            )));
        }
        (_, scm::Freshness::MissingBinary, _) => {
            return Err(TunError::not_installed(format!(
                "bundled core missing: {}",
                core.display()
            )));
        }
        state => {
            log::info!(
                "[tun/win] privileged runtime needs install/upgrade ({state:?}); elevating UAC"
            );
            elevate::run_elevated_install(&bundled, core, asset_dir).map_err(|e| {
                TunError::failed(
                    "tun_install_failed",
                    format!("安装虚拟网卡服务失败（需管理员授权）: {e}"),
                )
            })?;
        }
    }
    // Record main app path ASAP so orphan cleanup can find us after delete.
    if let Ok(exe) = std::env::current_exe() {
        scm::write_app_exe_marker(&exe);
    }
    Ok(probe())
}

pub fn start_tun(
    config_path: &Path,
    core_path: &Path,
    dns_hijack: &str,
    asset_dir: Option<&Path>,
) -> Result<(), TunError> {
    // Ensure service present (may prompt UAC once).
    let state = ensure_installed_with_core(core_path, asset_dir)?;
    if matches!(state, TunServiceState::NotInstalled) {
        return Err(not_installed_error());
    }

    // Avoid Hyper-V / wrong NIC: bind TUN outbounds to default route interface.
    match outbound_if::resolve_default_outbound_interface() {
        Ok(iface) => {
            match config_patch::patch_tun_config_outbounds_interface(
                &config_path.to_string_lossy(),
                &iface,
            ) {
                Ok(true) => log::info!("[tun/win] patched autoOutboundsInterface -> {iface}"),
                Ok(false) => log::debug!("[tun/win] autoOutboundsInterface already {iface}"),
                Err(e) => {
                    return Err(TunError::failed(
                        "tun_route_patch",
                        format!("准备代理节点绕行路由失败: {e}"),
                    ));
                }
            }
        }
        Err(e) => {
            return Err(TunError::failed(
                "tun_outbound_interface",
                format!("无法确定代理流量的物理出口网卡: {e}"),
            ));
        }
    }

    let config = config_path
        .to_str()
        .ok_or_else(|| TunError::failed("bad_path", "config path is not UTF-8"))?;
    let dns = if dns_hijack.trim().is_empty() {
        "1.1.1.1"
    } else {
        dns_hijack.trim()
    };

    // Record main app path for orphan cleanup (sidecar sits next to AureStream.exe).
    if let Some(app_exe) = core_path
        .parent()
        .map(|d| d.join("AureStream.exe"))
        .filter(|p| p.is_file())
        .or_else(|| {
            core_path
                .parent()
                .map(|d| d.join("aurestream.exe"))
                .filter(|p| p.is_file())
        })
        .or_else(|| std::env::current_exe().ok().filter(|p| p.is_file()))
    {
        scm::write_app_exe_marker(&app_exe);
    }

    // Bind this service session to the exact app process that requested it.
    // The service opens a process handle before spawning the core, so later PID
    // reuse cannot keep an orphaned TUN session alive.
    let app_pid = std::process::id().to_string();
    log::info!("[tun/win] StartService config={config} dns={dns} kernel=xray app_pid={app_pid}");
    scm::start_service_with_args(&[config, dns, &app_pid])
        .map_err(|e| TunError::failed("tun_service_start", format!("启动虚拟网卡服务失败: {e}")))?;

    // Service reports Running after core API ready + DNS hijack; double-check API.
    let api_port = parse_api_port(config_path).unwrap_or(10809);
    if !wait_api(api_port) {
        let _ = scm::stop_service();
        return Err(TunError::failed(
            "tun_start_timeout",
            format!("虚拟网卡内核启动超时（API :{api_port} 未就绪）"),
        ));
    }

    Ok(())
}

pub fn stop_tun() -> Result<(), TunError> {
    log::info!("[tun/win] stop_service");
    scm::stop_service()
        .map_err(|e| TunError::failed("tun_service_stop", format!("停止虚拟网卡服务失败: {e}")))?;
    Ok(())
}

fn parse_api_port(path: &Path) -> Option<u16> {
    let raw = std::fs::read_to_string(path).ok()?;
    Some(service::parse_api_port_from_config_text(&raw))
}

fn wait_api(port: u16) -> bool {
    use std::net::TcpStream;
    let deadline = Instant::now() + READY_TIMEOUT;
    while Instant::now() < deadline {
        if TcpStream::connect_timeout(&([127, 0, 0, 1], port).into(), Duration::from_millis(80))
            .is_ok()
        {
            return true;
        }
        // Service may still be starting.
        if matches!(
            scm::query_state(),
            scm::QueriedState::Stopped | scm::QueriedState::NotInstalled
        ) {
            // Give a brief grace then fail.
            std::thread::sleep(POLL);
            if matches!(
                scm::query_state(),
                scm::QueriedState::Stopped | scm::QueriedState::NotInstalled
            ) {
                return false;
            }
        }
        std::thread::sleep(POLL);
    }
    false
}

pub(super) fn elevate_uninstall(bundled: &Path) -> Result<(), super::TunError> {
    elevate::run_elevated_uninstall(bundled).map_err(|e| {
        super::TunError::failed("tun_uninstall_failed", format!("卸载虚拟网卡服务失败: {e}"))
    })
}
