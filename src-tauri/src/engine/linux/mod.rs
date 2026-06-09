use crate::engine::process::ProcessManager;
use crate::engine::EngineManager;
use crate::engine::ProxyMode;
use aurestream_plugin_proxy::sysproxy::{clear_system_proxy, set_system_proxy};
use aurestream_plugin_tun::linux::{
    apply_system_dns_override, prepare_dns_override, restore_system_dns, set_dns_override,
    stop_tun_and_restore_dns, take_dns_override,
};
use tauri::AppHandle;

pub struct LinuxEngine;

impl EngineManager for LinuxEngine {
    async fn start(
        app: &AppHandle,
        mode: ProxyMode,
        config_path: String,
        start_epoch: u64,
    ) -> Result<(), String> {
        use std::sync::Arc;
        use tauri_plugin_shell::ShellExt;

        match mode {
            ProxyMode::SystemProxy => {
                let should_set_system_proxy = matches!(mode, ProxyMode::SystemProxy);
                let cmd = app
                    .shell()
                    .sidecar("aurestream-core")
                    .map_err(|e| format!("sidecar lookup failed: {}", e))?
                    .args(["run", "-c", &config_path, "--disable-color"]);
                let (rx, child) = cmd.spawn().map_err(|e| format!("spawn failed: {}", e))?;
                let child_pid = child.pid();
                log::info!(
                    "[aurestream-core] spawned pid={} mode=SystemProxy",
                    child_pid
                );
                crate::engine::monitor::spawn_process_monitor(
                    app.clone(),
                    rx,
                    Arc::new(mode.clone()),
                    child_pid,
                    start_epoch,
                );
                {
                    let mut mgr = ProcessManager::acquire();
                    mgr.mode = Some(Arc::new(mode));
                    mgr.config_path = Some(Arc::new(config_path));
                    mgr.child = Some(child);
                    mgr.is_stopping = false;
                }
                if should_set_system_proxy {
                    set_system_proxy(app, crate::engine::ports::mixed_proxy_port(app))
                        .await
                        .map_err(|e| e.to_string())?;
                }
            }
            ProxyMode::IntoProxy => {
                // AureStream uses IntoProxy for TUN
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

                let sidecar_path = crate::engine::helper::get_sidecar_path(std::path::Path::new(
                    "aurestream-core",
                ))
                .map_err(|e| format!("Failed to get sidecar path: {}", e))?;
                let dns_override_args = dns_info.as_ref().and_then(|(iface, original)| {
                    let gateway =
                        crate::engine::helper::extract_tun_gateway_from_config(&config_path)
                            .unwrap_or_default();
                    if gateway.is_empty() {
                        None
                    } else {
                        Some((
                            iface.clone(),
                            gateway,
                            original
                                .split_whitespace()
                                .map(|server| server.to_string())
                                .collect(),
                        ))
                    }
                });
                let cmd = aurestream_plugin_privilege::linux::create_privileged_command(
                    app,
                    sidecar_path,
                    config_path.clone(),
                    dns_override_args,
                );
                let (rx, child) = cmd.spawn().map_err(|e| format!("spawn failed: {}", e))?;
                let child_pid = child.pid();
                log::info!(
                    "[sing-box] spawned pid={} (pkexec) mode=IntoProxy",
                    child_pid
                );
                crate::engine::monitor::spawn_process_monitor(
                    app.clone(),
                    rx,
                    Arc::new(mode.clone()),
                    child_pid,
                    start_epoch,
                );
                {
                    let mut mgr = ProcessManager::acquire();
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
            let mut mgr = ProcessManager::acquire();
            mgr.is_stopping = true;
            (mgr.mode.clone(), mgr.child.take())
        };
        let Some(mode) = mode else {
            return Ok(());
        };
        match mode.as_ref() {
            ProxyMode::SystemProxy => {
                let _ = clear_system_proxy(app).await;
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
                crate::engine::shutdown::wait_for_sidecar_ports_release(app).await;
            }
            ProxyMode::IntoProxy => {
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
            let manager = ProcessManager::acquire();
            match (manager.mode.as_ref(), manager.config_path.as_ref()) {
                (Some(m), Some(p)) if matches!(**m, ProxyMode::IntoProxy) => p.as_str().to_string(),
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
        if std::path::Path::new(aurestream_plugin_privilege::linux::HELPER_PATH).exists() {
            Ok(())
        } else {
            Err(format!(
                "{} not found — is the AureStream package installed?",
                aurestream_plugin_privilege::linux::HELPER_PATH
            ))
        }
    }

    async fn uninstall_service(app: &AppHandle) -> Result<(), String> {
        let running = {
            let mgr = ProcessManager::acquire();
            mgr.child.is_some()
        };
        if running {
            Self::stop(app).await?;
        }

        tokio::task::spawn_blocking(|| {
            aurestream_plugin_privilege::linux::uninstall_helper_sync(|| {
                aurestream_plugin_tun::linux::stop_tun_and_restore_dns(None)
            })
        })
        .await
        .map_err(|e| format!("uninstall join error: {}", e))?
    }

    async fn probe(_app: &AppHandle) -> Result<String, String> {
        if std::path::Path::new(aurestream_plugin_privilege::linux::HELPER_PATH).exists() {
            Ok("available".into())
        } else {
            Err(format!(
                "{} missing",
                aurestream_plugin_privilege::linux::HELPER_PATH
            ))
        }
    }

    async fn restart(_app: &AppHandle) -> Result<(), String> {
        aurestream_plugin_privilege::linux::reload()
    }
}
