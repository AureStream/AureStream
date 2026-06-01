pub mod dns_watcher;
pub mod helper;
pub(crate) mod watchdog;

use self::helper as macos_helper;
use crate::engine::helper::extract_tun_gateway_from_config;
use crate::engine::sysproxy::{clear_system_proxy, set_system_proxy};
use crate::engine::EngineManager;
use std::process::Command;
use std::sync::Mutex;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;
pub const TUN_INTERFACE_NAME: &str = "utun233";

// ----------------------------------------------------------------------------
// Active-primary DNS override slot
// ----------------------------------------------------------------------------
#[derive(Clone, Debug)]
pub(crate) struct ActiveOverride {
    pub service: String,
    pub captured: String,
    pub gateway: String,
    pub released: bool,
}

static ACTIVE_OVERRIDE: Mutex<Option<ActiveOverride>> = Mutex::new(None);

pub(crate) fn active_override_snapshot() -> Option<ActiveOverride> {
    ACTIVE_OVERRIDE
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone()
}

fn take_active_override() -> Option<ActiveOverride> {
    let mut slot = ACTIVE_OVERRIDE.lock().unwrap_or_else(|e| e.into_inner());
    let taken = slot.take();
    if let Some(ref a) = taken {
        log::info!(
            "[dns] drain slot: service='{}' captured='{}'",
            a.service,
            a.captured
        );
    } else {
        log::info!("[dns] drain slot: empty");
    }
    taken
}

// ============================================================================
// Helper-backed TUN lifecycle
// ============================================================================

pub fn ensure_helper_installed() -> Result<(), String> {
    let ping_result = macos_helper::api::ping();
    if ping_result.is_err() {
        log::info!("[helper] not responding, triggering SMJobBless install...");
        return macos_helper::api::install();
    }

    let bundled = bundled_helper_path().and_then(|p| read_helper_cfbundle_version(&p));
    let installed = read_helper_cfbundle_version(std::path::Path::new(
        "/Library/PrivilegedHelperTools/com.root.aurestream.helper",
    ));

    match (bundled, installed) {
        (Some(b), Some(i)) if b != i => {
            log::info!(
                "[helper] CFBundleVersion bundled={} installed={}; upgrading via SMJobBless",
                b,
                i
            );
            macos_helper::api::install()
        }
        _ => Ok(()),
    }
}

fn bundled_helper_path() -> Option<std::path::PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let contents = exe.parent()?.parent()?;
    let p = contents
        .join("Library")
        .join("LaunchServices")
        .join("com.root.aurestream.helper");
    if p.exists() {
        Some(p)
    } else {
        None
    }
}

fn read_helper_cfbundle_version(path: &std::path::Path) -> Option<String> {
    let data = std::fs::read(path).ok()?;
    let key = b"<key>CFBundleVersion</key>";
    let key_pos = data.windows(key.len()).position(|w| w == key)?;
    let after_key = &data[key_pos + key.len()..];
    let open = b"<string>";
    let open_pos = after_key.windows(open.len()).position(|w| w == open)?;
    let value_start = open_pos + open.len();
    let close = b"</string>";
    let close_rel = after_key[value_start..]
        .windows(close.len())
        .position(|w| w == close)?;
    let bytes = &after_key[value_start..value_start + close_rel];
    std::str::from_utf8(bytes).ok().map(|s| s.to_string())
}

pub fn start_tun_via_helper(app: &AppHandle, config_path: &str) -> Result<i32, String> {
    let enable_bypass_router: bool = app
        .get_store("settings.json")
        .and_then(|s| s.get("enable_bypass_router_key"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    if enable_bypass_router {
        if let Err(e) = macos_helper::api::set_ip_forwarding(true) {
            log::warn!("[helper] set_ip_forwarding(true) failed: {}", e);
        }
    }

    if let Err(e) = apply_system_dns_override(config_path) {
        log::warn!("[dns] apply_system_dns_override failed: {}", e);
    }

    dns_watcher::ensure_started();

    let log_path = crate::core::log::resolve_singbox_log_path(app)
        .ok_or_else(|| "failed to resolve sing-box log path".to_string())?;
    let log_path_str = log_path.to_string_lossy();

    let pid = macos_helper::api::start_sing_box(config_path, &log_path_str)?;
    log::info!(
        "[helper] sing-box started, pid={} log={}",
        pid,
        log_path_str
    );
    Ok(pid)
}

pub async fn stop_tun_process() -> Result<(), String> {
    log::info!("[dns] user-stop: beginning DNS restore sequence");
    let taken = take_active_override();
    let applied = apply_captured_originals_sync(taken.as_ref());

    log::info!("[helper] sending SIGTERM to sing-box");
    macos_helper::api::stop_sing_box()?;
    log::info!("[helper] SIGTERM sent to sing-box, waiting 500ms for TUN teardown");

    tokio::time::sleep(std::time::Duration::from_millis(500)).await;

    if let Err(e) = macos_helper::api::set_ip_forwarding(false) {
        log::warn!("[helper] set_ip_forwarding(false) failed: {}", e);
    }

    if let Err(e) = macos_helper::api::remove_tun_routes(TUN_INTERFACE_NAME) {
        log::warn!(
            "[helper] remove_tun_routes({}) failed: {}",
            TUN_INTERFACE_NAME,
            e
        );
    } else {
        log::info!("[helper] TUN routes removed on {}", TUN_INTERFACE_NAME);
    }

    verify_and_fallback(applied.as_ref()).await;

    macos_helper::api::flush_dns_cache().ok();
    log::info!("[dns] user-stop: restore sequence complete");
    Ok(())
}

// ============================================================================
// macOS System DNS Override
// ============================================================================

fn detect_active_network_service() -> Result<String, String> {
    let out = Command::new("route")
        .args(["-n", "get", "default"])
        .output()
        .map_err(|e| format!("route get default failed: {}", e))?;
    let stdout = String::from_utf8_lossy(&out.stdout);
    let iface = stdout
        .lines()
        .find_map(|l| {
            l.trim()
                .strip_prefix("interface:")
                .map(|s| s.trim().to_string())
        })
        .ok_or_else(|| "no default interface".to_string())?;
    log::debug!("[dns] default interface: {}", iface);

    let out = Command::new("networksetup")
        .arg("-listallhardwareports")
        .output()
        .map_err(|e| format!("networksetup -listallhardwareports failed: {}", e))?;
    let stdout = String::from_utf8_lossy(&out.stdout);

    let mut current_port: Option<String> = None;
    for line in stdout.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("Hardware Port:") {
            current_port = Some(rest.trim().to_string());
        } else if let Some(rest) = line.strip_prefix("Device:") {
            if rest.trim() == iface {
                if let Some(svc) = current_port.take() {
                    log::debug!("[dns] active service: {}", svc);
                    return Ok(svc);
                }
            }
        }
    }
    Err(format!(
        "could not map interface {} to a network service",
        iface
    ))
}

fn read_service_dns(service: &str) -> String {
    let out = match Command::new("networksetup")
        .args(["-getdnsservers", service])
        .output()
    {
        Ok(o) => o,
        Err(e) => {
            log::warn!("[dns] -getdnsservers [{}] failed: {}", service, e);
            return "empty".to_string();
        }
    };
    let stdout = String::from_utf8_lossy(&out.stdout);
    let ips: Vec<&str> = stdout
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty() && l.parse::<std::net::IpAddr>().is_ok())
        .collect();
    if ips.is_empty() {
        "empty".to_string()
    } else {
        ips.join(" ")
    }
}

fn dns_entries(spec: &str) -> Vec<&str> {
    if spec == "empty" {
        return Vec::new();
    }
    spec.split_whitespace().filter(|s| !s.is_empty()).collect()
}

fn dns_spec_from_entries(entries: Vec<&str>) -> String {
    if entries.is_empty() {
        "empty".to_string()
    } else {
        entries.join(" ")
    }
}

fn dns_without_gateway<'a>(spec: &'a str, gateway: &str) -> String {
    dns_spec_from_entries(
        dns_entries(spec)
            .into_iter()
            .filter(|s| *s != gateway)
            .collect(),
    )
}

fn dns_with_gateway_first(spec: &str, gateway: &str) -> String {
    let mut entries = vec![gateway];
    entries.extend(dns_entries(spec).into_iter().filter(|s| *s != gateway));
    dns_spec_from_entries(entries)
}

fn dns_has_gateway_first(spec: &str, gateway: &str) -> bool {
    dns_entries(spec).first().is_some_and(|s| *s == gateway)
}

pub fn apply_system_dns_override(config_path: &str) -> Result<(), String> {
    let gateway = extract_tun_gateway_from_config(config_path)
        .ok_or_else(|| format!("could not extract TUN gateway from {}", config_path))?;
    {
        let mut slot = ACTIVE_OVERRIDE.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(active) = slot.as_mut() {
            if active.released {
                log::info!(
                    "[dns] apply: clearing released flag on [{}] before re-apply",
                    active.service
                );
                active.released = false;
            }
        }
    }
    reapply_on_active_primary(&gateway)
}

pub(crate) fn reapply_on_active_primary(gateway: &str) -> Result<(), String> {
    {
        let slot = ACTIVE_OVERRIDE.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(active) = slot.as_ref() {
            if active.released {
                log::debug!(
                    "[dns] reapply: released flag set on [{}], skipping",
                    active.service
                );
                return Ok(());
            }
        }
    }
    let new_service = detect_active_network_service()?;
    let current = read_service_dns(&new_service);
    log::debug!(
        "[dns] apply: active='{}' current='{}' target='{}'",
        new_service,
        current,
        gateway
    );

    let mut slot = ACTIVE_OVERRIDE.lock().unwrap_or_else(|e| e.into_inner());
    match slot.as_ref() {
        Some(prev) if prev.service == new_service => {
            if dns_has_gateway_first(&current, gateway) {
                log::debug!(
                    "[dns] apply: [{}] already set to gateway, nothing to do",
                    new_service
                );
                return Ok(());
            }
            log::info!(
                "[dns] apply: external write detected on [{}] (was captured='{}' → now '{}'), updating captured",
                new_service,
                prev.captured,
                current
            );
            let mut updated = prev.clone();
            updated.captured = dns_without_gateway(&current, gateway);
            let target = dns_with_gateway_first(&updated.captured, gateway);
            updated.gateway = gateway.to_string();
            *slot = Some(updated);
            drop(slot);
            macos_helper::api::set_dns_servers(&new_service, &target)?;
            macos_helper::api::flush_dns_cache().ok();
            log::info!("[dns] apply: re-override [{}] → {}", new_service, target);
            Ok(())
        }
        Some(prev) => {
            log::info!(
                "[dns] apply: primary switched '{}' → '{}', restoring old service first",
                prev.service,
                new_service
            );
            let prev_snap = prev.clone();
            drop(slot);
            let old_current = read_service_dns(&prev_snap.service);
            let old_target = dns_without_gateway(&old_current, &prev_snap.gateway);
            if let Err(e) = macos_helper::api::set_dns_servers(&prev_snap.service, &old_target) {
                log::warn!(
                    "[dns] apply: restore old [{}] → '{}' failed: {}",
                    prev_snap.service,
                    old_target,
                    e
                );
            } else {
                log::info!(
                    "[dns] apply: restored old [{}] → '{}'",
                    prev_snap.service,
                    old_target
                );
            }

            log::info!(
                "[dns] apply: capture new [{}] original='{}'",
                new_service,
                current
            );
            let captured = dns_without_gateway(&current, gateway);
            let target = dns_with_gateway_first(&captured, gateway);
            macos_helper::api::set_dns_servers(&new_service, &target)?;
            macos_helper::api::flush_dns_cache().ok();
            let mut slot = ACTIVE_OVERRIDE.lock().unwrap_or_else(|e| e.into_inner());
            *slot = Some(ActiveOverride {
                service: new_service.clone(),
                captured,
                gateway: gateway.to_string(),
                released: false,
            });
            log::info!("[dns] apply: override [{}] → {}", new_service, target);
            Ok(())
        }
        None => {
            log::info!(
                "[dns] apply: fresh override, capture [{}] original='{}'",
                new_service,
                current
            );
            let captured = dns_without_gateway(&current, gateway);
            let target = dns_with_gateway_first(&captured, gateway);
            macos_helper::api::set_dns_servers(&new_service, &target)?;
            macos_helper::api::flush_dns_cache().ok();
            *slot = Some(ActiveOverride {
                service: new_service.clone(),
                captured,
                gateway: gateway.to_string(),
                released: false,
            });
            log::info!("[dns] apply: override [{}] → {}", new_service, target);
            Ok(())
        }
    }
}

fn apply_captured_originals_sync(taken: Option<&ActiveOverride>) -> Option<(String, String)> {
    let Some(active) = taken else {
        log::info!("[dns] phase 1 (pre-kill write): slot empty, skipping");
        return None;
    };
    log::info!(
        "[dns] phase 1 (pre-kill write): removing gateway from [{}]",
        active.service,
    );
    let current = read_service_dns(&active.service);
    let target = dns_without_gateway(&current, &active.gateway);
    if let Err(e) = macos_helper::api::set_dns_servers(&active.service, &target) {
        log::warn!("[dns] phase 1 [{}] write failed: {}", active.service, e);
        return None;
    }
    macos_helper::api::flush_dns_cache().ok();
    log::info!("[dns] phase 1 done, cache flushed");
    Some((active.service.clone(), target))
}

async fn verify_and_fallback(applied: Option<&(String, String)>) {
    let Some((service, original)) = applied else {
        log::info!("[dns] phase 2 (post-kill verify): nothing to verify, skipping");
        return;
    };
    log::info!(
        "[dns] phase 2 (post-kill verify): probing [{}] '{}'",
        service,
        original
    );
    if original == "empty" {
        log::info!("[dns] phase 2 [{}] kept DHCP default (no probe)", service);
        return;
    }
    let mut alive_ip: Option<String> = None;
    for ip in original.split_whitespace() {
        log::info!("[dns] phase 2 probe [{}] → {} ...", service, ip);
        if crate::commands::dns::probe_dns_reachable(ip).await {
            alive_ip = Some(ip.to_string());
            break;
        }
    }
    if let Some(ip) = alive_ip {
        log::info!(
            "[dns] phase 2 [{}] {} alive, keeping original '{}'",
            service,
            ip,
            original
        );
        macos_helper::api::flush_dns_cache().ok();
        return;
    }
    log::warn!(
        "[dns] phase 2 [{}] all of '{}' unreachable — releasing to DHCP (writing empty)",
        service,
        original
    );
    if let Err(e) = macos_helper::api::set_dns_servers(service, "empty") {
        log::warn!(
            "[dns] phase 2 fallback write [{}] → empty failed: {}",
            service,
            e
        );
    } else {
        log::info!("[dns] phase 2 [{}] fell back to empty (DHCP)", service);
    }
    macos_helper::api::flush_dns_cache().ok();
    log::info!("[dns] phase 2 done, cache flushed");
}

pub fn release_dns_on_network_down() -> Result<(), String> {
    let (service, prev_gateway) = {
        let mut slot = ACTIVE_OVERRIDE.lock().unwrap_or_else(|e| e.into_inner());
        let Some(active) = slot.as_mut() else {
            log::info!("[dns] NetworkDown: slot empty, nothing to release");
            return Ok(());
        };
        if active.released {
            log::info!(
                "[dns] NetworkDown: [{}] already released, skipping",
                active.service
            );
            return Ok(());
        }
        active.released = true;
        (active.service.clone(), active.gateway.clone())
    };
    log::info!(
        "[dns] NetworkDown: releasing [{}] to empty (was gateway={})",
        service,
        prev_gateway
    );
    macos_helper::api::set_dns_servers(&service, "empty")?;
    macos_helper::api::flush_dns_cache().ok();
    Ok(())
}

pub async fn restore_system_dns() -> Result<(), String> {
    log::info!("[dns] crash-path restore: sing-box already exited, running write + verify");
    let taken = take_active_override();
    let applied = apply_captured_originals_sync(taken.as_ref());
    verify_and_fallback(applied.as_ref()).await;
    log::info!("[dns] crash-path restore: complete");
    Ok(())
}

// ============================================================================
// EngineManager trait impl
// ============================================================================

pub struct MacOSEngine;

impl EngineManager for MacOSEngine {
    async fn start(
        app: &AppHandle,
        mode: crate::engine::ProxyMode,
        config_path: String,
        start_epoch: u64,
    ) -> Result<(), String> {
        use std::sync::Arc;
        use tauri_plugin_shell::ShellExt;

        match mode {
            crate::engine::ProxyMode::SystemProxy => {
                let should_set_system_proxy = matches!(mode, crate::engine::ProxyMode::SystemProxy);
                let cmd = app
                    .shell()
                    .sidecar("aurestream-core")
                    .map_err(|e| format!("sidecar lookup failed: {}", e))?
                    .args(["run", "-c", &config_path, "--disable-color"]);
                let (rx, child) = cmd.spawn().map_err(|e| format!("spawn failed: {}", e))?;
                let child_pid = child.pid();
                log::info!("[aurestream-core] spawned pid={} mode=SystemProxy", child_pid);
                crate::core::monitor::spawn_process_monitor(
                    app.clone(),
                    rx,
                    Arc::new(mode.clone()),
                    child_pid,
                    start_epoch,
                );
                {
                    let mut mgr = crate::core::ProcessManager::acquire();
                    mgr.mode = Some(Arc::new(mode));
                    mgr.config_path = Some(Arc::new(config_path));
                    mgr.child = Some(child);
                    mgr.is_stopping = false;
                }
                if should_set_system_proxy {
                    set_system_proxy(app).await.map_err(|e| e.to_string())?;
                }
            }
            crate::engine::ProxyMode::IntoProxy => { // AureStream uses IntoProxy for TUN mode
                Self::ensure_installed(app).await?;
                let app_c = app.clone();
                let path_c = config_path.clone();
                tokio::task::spawn_blocking(move || start_tun_via_helper(&app_c, &path_c))
                    .await
                    .map_err(|e| format!("start_tun join error: {}", e))?
                    .map_err(|e| format!("start_tun_via_helper failed: {}", e))?;

                let mut exit_rx = macos_helper::subscribe_sing_box_exits();
                let exit_app = app.clone();
                let mode_arc = Arc::new(crate::engine::ProxyMode::IntoProxy);
                let exit_mode = Arc::clone(&mode_arc);
                let exit_spawn_epoch = start_epoch;
                tokio::spawn(async move {
                    if let Some(exit) = exit_rx.recv().await {
                        log::info!(
                            "[helper-bridge] sing-box exit event pid={} code={}",
                            exit.pid,
                            exit.exit_code
                        );
                        let payload = tauri_plugin_shell::process::TerminatedPayload {
                            code: Some(exit.exit_code),
                            signal: None,
                        };
                        crate::core::monitor::handle_process_termination(
                            &exit_app,
                            &exit_mode,
                            payload,
                            exit_spawn_epoch,
                        )
                        .await;
                    }
                });

                let config_path_arc = Arc::new(config_path);
                {
                    let mut mgr = crate::core::ProcessManager::acquire();
                    mgr.mode = Some(Arc::clone(&mode_arc));
                    mgr.config_path = Some(Arc::clone(&config_path_arc));
                    mgr.child = None; // managed by helper
                    mgr.is_stopping = false;
                }

                let bypass_router_enabled = app
                    .get_store("settings.json")
                    .and_then(|store| store.get("enable_bypass_router_key"))
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                if bypass_router_enabled {
                    watchdog::spawn(app.clone(), Arc::clone(&config_path_arc));
                }

                let _ = clear_system_proxy(app).await;
            }
        }
        Ok(())
    }

    async fn stop(app: &AppHandle) -> Result<(), String> {
        let (mode, child) = {
            let mut mgr = crate::core::ProcessManager::acquire();
            mgr.is_stopping = true;
            (mgr.mode.clone(), mgr.child.take())
        };
        let Some(mode) = mode else {
            return Ok(());
        };
        match mode.as_ref() {
            crate::engine::ProxyMode::SystemProxy => {
                if matches!(mode.as_ref(), crate::engine::ProxyMode::SystemProxy) {
                    let _ = clear_system_proxy(app).await;
                }
                if let Some(child) = child {
                    use libc::{kill, SIGTERM};
                    let pid = child.pid();
                    if unsafe { kill(pid as i32, SIGTERM) } != 0 {
                        log::error!(
                            "[stop] Failed to send SIGTERM to PID {}: {}",
                            pid,
                            std::io::Error::last_os_error()
                        );
                    }
                }
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            }
            crate::engine::ProxyMode::IntoProxy => {
                stop_tun_process().await.map_err(|e| {
                    log::error!("Failed to stop TUN process: {}", e);
                    e
                })?;
            }
        }
        Ok(())
    }

    fn on_network_up(_app: &AppHandle) {
        let config_path = {
            let manager = crate::core::ProcessManager::acquire();
            match (manager.mode.as_ref(), manager.config_path.as_ref()) {
                (Some(m), Some(p)) if matches!(**m, crate::engine::ProxyMode::IntoProxy) => {
                    p.as_str().to_string()
                }
                _ => return,
            }
        };
        if let Err(e) = apply_system_dns_override(&config_path) {
            log::warn!("[dns] NetworkUp re-apply failed: {}", e);
        }
    }

    fn on_network_down(_app: &AppHandle) {
        if let Err(e) = release_dns_on_network_down() {
            log::warn!("[dns] NetworkDown release failed: {}", e);
        }
    }

    fn on_process_terminated(_app: &AppHandle, _was_user_stop: bool) {
        watchdog::cancel();
        log::info!("[dns] TUN process terminated — restoring captured original");
        tauri::async_runtime::spawn(async {
            if let Err(e) = restore_system_dns().await {
                log::warn!("[dns] fallback restore_system_dns failed: {}", e);
            }
        });
    }

    async fn ensure_installed(_app: &AppHandle) -> Result<(), String> {
        tokio::task::spawn_blocking(ensure_helper_installed)
            .await
            .map_err(|e| format!("ensure_installed join error: {}", e))?
    }

    async fn uninstall_service(_app: &AppHandle) -> Result<(), String> {
        log::info!("[mac] uninstall_service requested (no-op on macOS)");
        Ok(())
    }

    async fn probe(_app: &AppHandle) -> Result<String, String> {
        tokio::task::spawn_blocking(macos_helper::api::ping)
            .await
            .map_err(|e| format!("helper_ping join error: {}", e))?
    }

    async fn restart(_app: &AppHandle) -> Result<(), String> {
        let is_tun = {
            let manager = crate::core::ProcessManager::acquire();
            matches!(
                manager.mode.as_ref().map(|m| m.as_ref()),
                Some(crate::engine::ProxyMode::IntoProxy)
            )
        };
        if is_tun {
            tokio::task::spawn_blocking(macos_helper::api::reload_sing_box)
                .await
                .map_err(|e| format!("reload join error: {}", e))?
                .map_err(|e| format!("helper reload_sing_box failed: {}", e))?;
            log::info!("[reload] SIGHUP sent via helper");

            match tokio::task::spawn_blocking(macos_helper::api::flush_dns_cache).await {
                Ok(Ok(())) => log::info!("[reload] flushed DNS cache"),
                Ok(Err(e)) => log::warn!("[reload] flush_dns_cache failed: {}", e),
                Err(e) => log::warn!("[reload] flush_dns_cache join error: {}", e),
            }
        } else {
            match Command::new("pgrep").args(["-lf", "aurestream-core"]).output() {
                Ok(out) => {
                    let stdout = String::from_utf8_lossy(&out.stdout);
                    let lines: Vec<&str> = stdout.lines().collect();
                    log::info!(
                        "[reload] pgrep pre-pkill: {} aurestream-core process(es) {:?}",
                        lines.len(),
                        lines
                    );
                }
                Err(e) => log::warn!("[reload] pgrep pre-pkill failed: {}", e),
            }
            let pm_pid = {
                let m = crate::core::ProcessManager::acquire();
                m.child.as_ref().map(|c| c.pid())
            };
            log::info!(
                "[reload] pm_child_pid={:?} (expected sole SIGHUP target)",
                pm_pid
            );

            let output = Command::new("pkill")
                .args(["-HUP", "aurestream-core"])
                .output()
                .map_err(|e| format!("Failed to send SIGHUP: {}", e))?;
            let code = output.status.code();
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            if !output.status.success() {
                if code == Some(1) {
                    log::warn!(
                        "[reload] pkill -HUP matched 0 processes (code=1) — aurestream-core may already be dead"
                    );
                    return Err(format!("pkill -HUP matched nothing: {}", stderr));
                }
                return Err(format!("pkill -HUP non-zero (code={:?}): {}", code, stderr));
            }
            log::info!(
                "[reload] SIGHUP sent via pkill code={:?} stdout={:?} stderr={:?}",
                code,
                stdout.trim(),
                stderr.trim()
            );
        }
        Ok(())
    }
}
