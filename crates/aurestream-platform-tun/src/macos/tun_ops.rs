use super::helper as macos_helper;
use std::process::Command;
use std::sync::Mutex;
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

/// Start aurestream-core via privileged helper (DNS applied by caller after ready).
pub fn start_core_via_helper(
    config_path: &str,
    log_path_str: &str,
    enable_bypass_router: bool,
) -> Result<i32, String> {
    // IP forwarding is required for TUN bypass-router mode only.
    if enable_bypass_router {
        let mut retry_count = 0;
        let max_retries = 3;

        loop {
            match macos_helper::api::set_ip_forwarding(true) {
                Ok(()) => {
                    log::info!("[helper] IP forwarding enabled successfully");
                    break;
                }
                Err(e) => {
                    retry_count += 1;
                    if retry_count >= max_retries {
                        log::error!(
                            "[helper] set_ip_forwarding(true) failed after {} retries: {}",
                            max_retries,
                            e
                        );
                        return Err(format!(
                            "IP forwarding setup failed (required for TUN mode): {}. Please run with administrator privileges.",
                            e
                        ));
                    }
                    log::warn!(
                        "[helper] set_ip_forwarding(true) failed, retry {}/{}: {}",
                        retry_count,
                        max_retries,
                        e
                    );
                    std::thread::sleep(std::time::Duration::from_millis(500));
                }
            }
        }
    }

    let pid = macos_helper::api::start_sing_box(config_path, log_path_str)?;
    log::info!(
        "[helper] aurestream-core started with TUN routes, pid={} log={}",
        pid,
        log_path_str
    );
    Ok(pid)
}

/// Stop TUN: restore DNS **before** killing core, then tear down routes.
/// Synchronous so the shell can call from any context.
pub fn stop_tun_sync() -> Result<(), String> {
    log::info!("[dns] user-stop: beginning DNS restore sequence");

    // Phase 1: Pre-kill restore so physical NIC has working DNS at TUN teardown.
    let taken = take_active_override();
    let applied = apply_captured_originals_sync(taken.as_ref());

    log::info!("[helper] sending SIGTERM to aurestream-core");
    macos_helper::api::stop_sing_box()?;

    log::info!("[helper] waiting 500ms for TUN teardown");
    std::thread::sleep(std::time::Duration::from_millis(500));

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

    // Phase 2: keep restored DNS (sync path skips UDP probe; flush cache).
    if let Some((service, original)) = applied.as_ref() {
        log::info!(
            "[dns] phase 2: kept restored DNS [{}] '{}'",
            service,
            original
        );
    }
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

pub fn apply_system_dns_override(gateway: &str) -> Result<(), String> {
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

/// Release DNS override when the primary link drops (optional NetworkDown hook).
#[allow(dead_code)]
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
