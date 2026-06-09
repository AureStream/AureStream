use crate::engine::process::ProcessManager;
use crate::engine::state_machine::{transition, EngineState, EngineStateCell, Intent};
use crate::engine::EngineManager;
use crate::engine::ProxyMode;
use aurestream_plugin_privilege::macos::helper as macos_helper;
use aurestream_plugin_proxy::sysproxy::{clear_system_proxy, set_system_proxy};
use aurestream_plugin_tun::macos::{
    apply_system_dns_override, release_dns_on_network_down, restore_system_dns,
    start_tun_via_helper, stop_tun_process,
};
use std::process::Command;
use tauri::{AppHandle, Manager};
use tauri_plugin_store::StoreExt;

pub(crate) mod watchdog;

pub struct MacOSEngine;

impl EngineManager for MacOSEngine {
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
                    let port = crate::engine::ports::mixed_proxy_port(app);
                    set_system_proxy(app, port)
                        .await
                        .map_err(|e| e.to_string())?;
                }
            }
            ProxyMode::IntoProxy => {
                // AureStream uses IntoProxy for TUN mode
                Self::ensure_installed(app).await?;
                let bypass_router_enabled = app
                    .get_store("settings.json")
                    .and_then(|store| store.get("enable_bypass_router_key"))
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                let log_path_str = crate::engine::log::resolve_singbox_log_path(app)
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_default();
                let gateway = crate::engine::helper::extract_tun_gateway_from_config(&config_path)
                    .unwrap_or_default();

                let path_c = config_path.clone();
                tokio::task::spawn_blocking(move || {
                    start_tun_via_helper(&path_c, &log_path_str, bypass_router_enabled, &gateway)
                })
                .await
                .map_err(|e| format!("start_tun join error: {}", e))?
                .map_err(|e| format!("start_tun_via_helper failed: {}", e))?;

                let mut exit_rx = macos_helper::subscribe_sing_box_exits();
                let exit_app = app.clone();
                let mode_arc = Arc::new(ProxyMode::IntoProxy);
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
                        crate::engine::monitor::handle_process_termination(
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
                    let mut mgr = ProcessManager::acquire();
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
            let mut mgr = ProcessManager::acquire();
            mgr.is_stopping = true;
            let m = mgr.mode.clone();
            let c = mgr.child.take();
            mgr.reset();
            (m, c)
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
                let stop_result = stop_tun_process().await.map_err(|e| {
                    log::error!("Failed to stop TUN process: {}", e);
                    e
                });
                watchdog::cancel();
                crate::engine::shutdown::wait_for_sidecar_ports_release(app).await;

                let state = app.state::<EngineStateCell>().snapshot();
                if matches!(
                    state,
                    EngineState::Stopping { .. } | EngineState::Starting { .. }
                ) {
                    let _ = transition(app, Intent::MarkIdle);
                }
                stop_result?;
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
        if let Err(e) = apply_system_dns_override(
            &crate::engine::helper::extract_tun_gateway_from_config(&config_path)
                .unwrap_or_default(),
        ) {
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
        tokio::task::spawn_blocking(aurestream_plugin_privilege::macos::ensure_helper_installed)
            .await
            .map_err(|e| format!("ensure_installed join error: {}", e))?
    }

    async fn uninstall_service(app: &AppHandle) -> Result<(), String> {
        let running = {
            let mgr = ProcessManager::acquire();
            mgr.child.is_some()
        };
        if running {
            Self::stop(app).await?;
        }

        tokio::task::spawn_blocking(aurestream_plugin_privilege::macos::uninstall_privileged_helper)
            .await
            .map_err(|e| format!("uninstall join error: {}", e))?
    }

    async fn probe(_app: &AppHandle) -> Result<String, String> {
        tokio::task::spawn_blocking(aurestream_plugin_privilege::macos::probe_helper)
            .await
            .map_err(|e| format!("helper_probe join error: {}", e))?
    }

    async fn restart(_app: &AppHandle) -> Result<(), String> {
        let is_tun = {
            let manager = ProcessManager::acquire();
            matches!(
                manager.mode.as_ref().map(|m| m.as_ref()),
                Some(ProxyMode::IntoProxy)
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
            match Command::new("pgrep")
                .args(["-lf", "aurestream-core"])
                .output()
            {
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
                let m = ProcessManager::acquire();
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
