use std::process::Command;
use std::sync::Mutex;
use tauri::AppHandle;
use tauri_plugin_shell::process::Command as TauriCommand;
use tauri_plugin_shell::ShellExt;

use crate::engine::helper::extract_tun_gateway_from_config;
use crate::engine::sysproxy::{clear_system_proxy, set_system_proxy};
use crate::engine::EngineManager;

static DNS_OVERRIDE: Mutex<Option<(String, String)>> = Mutex::new(None);

fn set_dns_override(info: Option<(String, String)>) {
    *DNS_OVERRIDE.lock().unwrap_or_else(|e| e.into_inner()) = info;
}

fn take_dns_override() -> Option<(String, String)> {
    DNS_OVERRIDE
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .take()
}

pub const HELPER_PATH: &str = "/usr/lib/AureStream/aurestream-tun-helper";

pub fn create_privileged_command(
    app: &AppHandle,
    sidecar_path: String,
    path: String,
    dns_override: Option<&(String, String)>,
) -> Option<TauriCommand> {
    let mut args = vec![
        HELPER_PATH.to_string(),
        "start-tun".to_string(),
        sidecar_path,
        path.clone(),
    ];

    if let Some((iface, _original)) = dns_override {
        let gateway = extract_tun_gateway_from_config(&path).unwrap_or_default();
        if !gateway.is_empty() {
            args.push(iface.clone());
            args.push(gateway);
            args.extend(
                _original
                    .split_whitespace()
                    .map(|server| server.to_string()),
            );
        }
    }

    let args_ref: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    Some(app.shell().command("pkexec").args(args_ref))
}

pub fn stop_tun_and_restore_dns(dns_override: Option<&(String, String)>) -> Result<(), String> {
    let mut args = vec![HELPER_PATH, "stop-tun"];

    let iface_owned;
    let servers_owned;
    if let Some((iface, original_dns)) = dns_override {
        log::info!(
            "[dns] restore: setting [{}] DNS back to {}",
            iface,
            original_dns
        );
        iface_owned = iface.clone();
        servers_owned = original_dns.clone();
        args.push(&iface_owned);
        for server in servers_owned.split_whitespace() {
            args.push(server);
        }
    }

    let out = Command::new("pkexec")
        .args(&args)
        .output()
        .map_err(|e| format!("pkexec stop failed: {}", e))?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        log::warn!("[stop] pkexec non-zero exit: {}", stderr);
    }
    Ok(())
}

pub fn stop_tun_process() -> Result<(), String> {
    stop_tun_and_restore_dns(None)
}

fn detect_active_iface() -> Result<String, String> {
    let out = Command::new("sh")
        .arg("-c")
        .arg("ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i==\"dev\") print $(i+1)}' | head -1")
        .output()
        .map_err(|e| format!("ip route get failed: {}", e))?;
    let iface = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if iface.is_empty() {
        Err("no default interface".into())
    } else {
        Ok(iface)
    }
}

fn capture_original_dns(iface: &str) -> Result<String, String> {
    let out = Command::new("nmcli")
        .args(["-t", "-f", "IP4.DNS", "dev", "show", iface])
        .output()
        .map_err(|e| format!("nmcli failed: {}", e))?;
    let stdout = String::from_utf8_lossy(&out.stdout);
    let servers: Vec<&str> = stdout
        .lines()
        .filter_map(|l| l.split(':').nth(1))
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect();
    if !servers.is_empty() {
        return Ok(servers.join(" "));
    }

    let out = Command::new("resolvectl")
        .args(["status", iface])
        .output()
        .map_err(|e| format!("resolvectl status failed: {}", e))?;
    let stdout = String::from_utf8_lossy(&out.stdout);
    for line in stdout.lines() {
        let line = line.trim();
        if line.starts_with("DNS Servers:") || line.starts_with("Current DNS Server:") {
            if let Some(servers) = line.split(':').nth(1) {
                let s = servers.trim();
                if !s.is_empty() {
                    return Ok(s.to_string());
                }
            }
        }
    }

    Err(format!("could not determine original DNS for {}", iface))
}

pub fn prepare_dns_override(config_path: &str) -> Result<(String, String), String> {
    let _gateway = extract_tun_gateway_from_config(config_path)
        .ok_or_else(|| format!("could not extract TUN gateway from {}", config_path))?;
    let iface = detect_active_iface()?;
    let original_dns = capture_original_dns(&iface)?;
    log::info!(
        "[dns] captured original DNS for [{}]: {}",
        iface,
        original_dns
    );
    Ok((iface, original_dns))
}

pub fn apply_system_dns_override(config_path: &str) -> Result<(String, String), String> {
    let gateway = extract_tun_gateway_from_config(config_path)
        .ok_or_else(|| format!("could not extract TUN gateway from {}", config_path))?;
    let iface = detect_active_iface()?;
    let original_dns = capture_original_dns(&iface)?;

    log::info!(
        "[dns] resolvectl override → {} for [{}] (original: {})",
        gateway,
        iface,
        original_dns
    );
    let out = Command::new("pkexec")
        .arg(HELPER_PATH)
        .arg("dns-override")
        .arg(&iface)
        .arg(&gateway)
        .args(original_dns.split_whitespace())
        .output()
        .map_err(|e| format!("pkexec dns-override failed: {}", e))?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        log::warn!("[dns] dns-override non-zero exit: {}", stderr);
    }
    Ok((iface, original_dns))
}

pub fn restore_system_dns(iface: &str, original_dns: &str) -> Result<(), String> {
    log::info!(
        "[dns] restore: setting [{}] DNS back to {}",
        iface,
        original_dns
    );
    let mut args = vec![HELPER_PATH, "dns-restore", iface];
    let servers: Vec<&str> = original_dns.split_whitespace().collect();
    args.extend(servers);

    let out = Command::new("pkexec")
        .args(&args)
        .output()
        .map_err(|e| format!("pkexec dns-restore failed: {}", e))?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        return Err(format!("[dns] restore failed: {}", stderr));
    }
    Ok(())
}

pub struct LinuxEngine;

impl EngineManager for LinuxEngine {
    async fn start(
        app: &AppHandle,
        mode: crate::engine::ProxyMode,
        config_path: String,
        start_epoch: u64,
    ) -> Result<(), String> {
        use std::sync::Arc;
        use tauri_plugin_shell::ShellExt;

        match mode {
            crate::engine::ProxyMode::SystemProxy | crate::engine::ProxyMode::ManualProxy => {
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
            crate::engine::ProxyMode::IntoProxy => { // AureStream uses IntoProxy for TUN
                let dns_info = match prepare_dns_override(&config_path) {
                    Ok(info) => {
                        set_dns_override(Some(info.clone()));
                        Some(info)
                    }
                    Err(e) => {
                        log::warn!("[dns] prepare_dns_override failed: {}", e);
                        None
                    }
                };

                let sidecar_path =
                    crate::engine::helper::get_sidecar_path(std::path::Path::new("aurestream-core"))
                        .map_err(|e| format!("Failed to get sidecar path: {}", e))?;
                let cmd = create_privileged_command(
                    app,
                    sidecar_path,
                    config_path.clone(),
                    dns_info.as_ref(),
                )
                .ok_or_else(|| "pkexec command not available".to_string())?;
                let (rx, child) = cmd.spawn().map_err(|e| format!("spawn failed: {}", e))?;
                let child_pid = child.pid();
                log::info!(
                    "[sing-box] spawned pid={} (pkexec) mode=IntoProxy",
                    child_pid
                );
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
            crate::engine::ProxyMode::SystemProxy | crate::engine::ProxyMode::ManualProxy => {
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
                let dns_info = take_dns_override();
                stop_tun_and_restore_dns(dns_info.as_ref()).map_err(|e| {
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
        match apply_system_dns_override(&config_path) {
            Ok(info) => set_dns_override(Some(info)),
            Err(e) => log::warn!("[dns] NetworkUp re-apply failed: {}", e),
        }
    }

    fn on_process_terminated(_app: &AppHandle, was_user_stop: bool) {
        let dns_info = take_dns_override();
        if let Some((iface, original_dns)) = dns_info {
            log::info!(
                "[dns] TUN process terminated — restoring [{}] DNS to {}",
                iface,
                original_dns
            );
            if let Err(e) = restore_system_dns(&iface, &original_dns) {
                log::warn!("[dns] fallback restore_system_dns failed: {}", e);
            }
        } else if !was_user_stop {
            log::warn!(
                "[dns] TUN terminated but no dns_override captured; DNS may need manual restore"
            );
        } else {
            log::debug!("[dns] TUN user-stop: dns_override already consumed by stop path");
        }
    }

    async fn ensure_installed(_app: &AppHandle) -> Result<(), String> {
        if std::path::Path::new(HELPER_PATH).exists() {
            Ok(())
        } else {
            Err(format!(
                "{HELPER_PATH} not found — is the AureStream package installed?"
            ))
        }
    }

    async fn probe(_app: &AppHandle) -> Result<String, String> {
        if std::path::Path::new(HELPER_PATH).exists() {
            Ok("available".into())
        } else {
            Err(format!("{HELPER_PATH} missing"))
        }
    }

    async fn restart(_app: &AppHandle) -> Result<(), String> {
        let output = Command::new("pkexec")
            .args([HELPER_PATH, "reload"])
            .output()
            .map_err(|e| format!("pkexec reload failed: {}", e))?;
        if !output.status.success() {
            return Err(format!(
                "helper reload non-zero: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }
        log::info!("[reload] SIGHUP + flush-caches via helper");
        Ok(())
    }
}
