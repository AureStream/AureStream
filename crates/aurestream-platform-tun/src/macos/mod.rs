//! macOS TUN via SMJobBless privileged helper (`com.root.aurestream.helper`).
//!
//! Requires a signed app bundle with the helper embedded under
//! `Contents/Library/LaunchServices/`. Plain `tauri dev` without blessing will
//! report NotInstalled.

#![cfg(target_os = "macos")]

mod dns_watcher;
mod helper;
mod privilege;
mod tun_ops;

use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use super::{TunError, TunServiceState};

const READY_TIMEOUT: Duration = Duration::from_secs(25);
const POLL: Duration = Duration::from_millis(150);

pub fn probe() -> TunServiceState {
    match privilege::probe_helper() {
        Ok(msg) if msg.starts_with("installed_unreachable") => TunServiceState::Ready,
        Ok(_) => TunServiceState::Ready,
        Err(_) => TunServiceState::NotInstalled,
    }
}

pub fn ensure_installed() -> Result<TunServiceState, TunError> {
    privilege::ensure_helper_installed().map_err(|e| {
        if e.contains("未找到") || e.contains("not found") || e.contains("Helper") {
            TunError::not_installed(e)
        } else {
            TunError::failed("helper_install", e)
        }
    })?;
    Ok(probe())
}

pub fn start_tun(
    config_path: &Path,
    core_path: &Path,
    dns_hijack: &str,
    asset_dir: Option<&Path>,
) -> Result<(), TunError> {
    let _ = core_path; // helper derives aurestream-core from caller SecCode
    if let Some(assets) = asset_dir {
        stage_geo_next_to_core(core_path, assets);
    }

    ensure_installed()?;

    let config = config_path
        .to_str()
        .ok_or_else(|| TunError::failed("bad_path", "config path is not UTF-8"))?
        .to_string();

    // Prefer absolute config under Application Support (helper validates this).
    let config = std::fs::canonicalize(&config)
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or(config);

    let log_path = core_log_path();
    if let Some(parent) = Path::new(&log_path).parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    // Improved order vs legacy: start core first, wait API, then DNS hijack.
    // DNS target is public resolver (1.1.1.1) routed into TUN — same as Linux/Win.
    let dns = if dns_hijack.trim().is_empty() {
        "1.1.1.1"
    } else {
        dns_hijack.trim()
    };

    log::info!(
        "[tun/mac] helper start-core config={} log={} dns={}",
        config,
        log_path,
        dns
    );

    helper::exit_bridge_ensure_callback();

    // bypass_router IP forward only when needed (default off).
    let pid = tun_ops::start_core_via_helper(&config, &log_path, false).map_err(|e| {
        TunError::failed("helper_start", format!("启动特权内核失败: {e}"))
    })?;
    log::info!("[tun/mac] core pid={pid}");

    let api_port = parse_api_port(config_path).unwrap_or(10809);
    if !wait_api(api_port) {
        let _ = helper::api::stop_sing_box();
        return Err(TunError::failed(
            "tun_start_timeout",
            format!("虚拟网卡内核启动超时（API :{api_port} 未就绪）"),
        ));
    }

    if let Err(e) = tun_ops::apply_system_dns_override(dns) {
        log::warn!("[tun/mac] DNS override failed (continuing): {e}");
    } else {
        log::info!("[tun/mac] DNS override applied -> {dns}");
    }
    dns_watcher::ensure_started();

    Ok(())
}

pub fn stop_tun() -> Result<(), TunError> {
    log::info!("[tun/mac] stop_tun");
    // Synchronous path for stop (engine may call from async via block_in_place
    // or from sync drop). Use the sync stop sequence.
    tun_ops::stop_tun_sync().map_err(|e| TunError::failed("helper_stop", e))?;
    Ok(())
}

fn stage_geo_next_to_core(core: &Path, assets: &Path) {
    let Some(dir) = core.parent() else {
        return;
    };
    for name in ["geoip.dat", "geosite.dat"] {
        let src = assets.join(name);
        let dst = dir.join(name);
        if src.is_file() && !dst.is_file() {
            let _ = std::fs::copy(&src, &dst);
        }
    }
}

fn core_log_path() -> String {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".into());
    let dir = PathBuf::from(home)
        .join("Library")
        .join("Logs")
        .join("com.root.aurestream");
    let _ = std::fs::create_dir_all(&dir);
    dir.join("aurestream-core-helper.log")
        .to_string_lossy()
        .into_owned()
}

fn parse_api_port(path: &Path) -> Option<u16> {
    let raw = std::fs::read_to_string(path).ok()?;
    let v: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let arr = v.get("inbounds")?.as_array()?;
    for ib in arr {
        if ib.get("tag").and_then(|t| t.as_str()) == Some("api") {
            return ib.get("port").and_then(|p| p.as_u64()).map(|p| p as u16);
        }
    }
    None
}

fn wait_api(port: u16) -> bool {
    let deadline = Instant::now() + READY_TIMEOUT;
    while Instant::now() < deadline {
        if TcpStream::connect_timeout(
            &([127, 0, 0, 1], port).into(),
            Duration::from_millis(80),
        )
        .is_ok()
        {
            return true;
        }
        std::thread::sleep(POLL);
    }
    false
}
