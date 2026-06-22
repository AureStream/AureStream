use crate::core::EVENT_TAURI_LOG;
use crate::engine::process::ProcessManager;
use crate::engine::{EngineManager, ProxyMode};
use aurestream_plugin_proxy::sysproxy::{clear_system_proxy, set_system_proxy};
use aurestream_plugin_tun::scm;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::ShellExt;

pub struct WindowsEngine;

impl EngineManager for WindowsEngine {
    async fn start(
        app: &AppHandle,
        mode: ProxyMode,
        config_path: String,
        start_epoch: u64,
    ) -> Result<(), String> {
        let should_set_system_proxy = matches!(mode, ProxyMode::SystemProxy);

        if matches!(mode, ProxyMode::IntoProxy) {
            // Frontend pre-checks helper installation before switching to TUN mode.
            // If somehow we reach here without the service, the TUN service call will fail with a clear error.

            // Resolve the paths using the standard Tauri v2 sidecar layout
            let gateway = crate::engine::helper::extract_tun_gateway_from_config(&config_path)
                .unwrap_or_else(|| "-".to_string());

            let core_path_str =
                crate::engine::helper::get_sidecar_path(std::path::Path::new("aurestream-core"))
                    .map_err(|e| format!("Failed to get sidecar path: {}", e))?;

            let config_path_str = config_path.as_str();
            let args = [config_path_str, &gateway, &core_path_str];

            log::info!("[win] starting AureStreamTunService with args: {:?}", args);
            scm::start_service_with_args(&args)
                .map_err(|e| format!("Failed to start AureStream TUN Service: {}", e))?;

            {
                let mut mgr = ProcessManager::acquire();
                mgr.mode = Some(Arc::new(mode));
                mgr.config_path = Some(Arc::new(config_path));
                mgr.child = None;
                mgr.is_stopping = false;
            }
        } else {
            let cmd = app
                .shell()
                .sidecar("aurestream-core")
                .map_err(|e| format!("sidecar lookup failed: {}", e))?
                .args(["run", "-c", &config_path, "--disable-color"]);
            let (rx, child) = cmd.spawn().map_err(|e| format!("spawn failed: {}", e))?;
            let child_pid = child.pid();
            log::info!(
                "[aurestream-core] spawned pid={} mode={:?}",
                child_pid,
                mode
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
                if let Err(e) =
                    set_system_proxy(crate::engine::ports::mixed_proxy_port(app), crate::engine::resolve_proxy_bypass(app)).await
                {
                    let _ = app.emit(EVENT_TAURI_LOG, (2, format!("Failed to set proxy: {}", e)));
                    return Err(e.to_string());
                }
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
        let child_pid_for_log = child.as_ref().map(|c| c.pid());
        log::info!(
            "[win-stop] entry mode={:?} pm_child_pid={:?}",
            mode,
            child_pid_for_log
        );

        if matches!(mode.as_ref(), ProxyMode::SystemProxy) {
            if let Err(e) = clear_system_proxy().await {
                log::warn!("Failed to unset proxy: {}", e);
                let _ = app.emit(
                    EVENT_TAURI_LOG,
                    (2, format!("Failed to unset proxy: {}", e)),
                );
            }
        }

        if matches!(mode.as_ref(), ProxyMode::IntoProxy) {
            log::info!("[win-stop] stopping AureStreamTunService");
            if let Err(e) = scm::stop_service() {
                log::warn!("Failed to stop AureStreamTunService: {}", e);
            }
        }

        if let Some(child) = child {
            let pid = child.pid();
            let kill_result = child.kill();
            match &kill_result {
                Ok(()) => log::info!("[win-stop] child_kill_result=Ok pid={}", pid),
                Err(e) => log::info!("[win-stop] child_kill_result=Err({}) pid={}", e, pid),
            }
            kill_result.map_err(|e| e.to_string())?;
        }

        crate::engine::shutdown::wait_for_sidecar_ports_release(app).await;

        Ok(())
    }

    async fn restart(app: &AppHandle) -> Result<(), String> {
        let (mode, config_path) = {
            let manager = ProcessManager::acquire();
            let mode = manager.mode.as_ref().map(|m| (**m).clone());
            let cfg = manager
                .config_path
                .as_ref()
                .map(|p| p.as_str().to_string())
                .unwrap_or_default();
            (mode, cfg)
        };

        let Some(mode) = mode else {
            return Err("No running process found".to_string());
        };

        let start_epoch = app
            .state::<crate::engine::state_machine::EngineStateCell>()
            .snapshot()
            .epoch();
        let mixed_port = crate::engine::ports::mixed_proxy_port(app);
        Self::stop(app).await?;

        let release_deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
        while std::time::Instant::now() < release_deadline
            && !crate::engine::ports::probe_port_bindable(mixed_port)
        {
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        }

        Self::start(app, mode, config_path, start_epoch).await
    }

    fn on_process_terminated(_app: &AppHandle, _was_user_stop: bool) {
        log::info!("[win] process terminated, clearing system proxy");
        tauri::async_runtime::spawn(async move {
            if let Err(e) = clear_system_proxy().await {
                log::warn!("[win] failed to clear system proxy on termination: {}", e);
            }
        });
    }

    async fn ensure_installed(_app: &AppHandle) -> Result<(), String> {
        let tun_service_path_str =
            crate::engine::helper::get_sidecar_path(std::path::Path::new("tun-service"))
                .map_err(|e| format!("Failed to get sidecar path: {}", e))?;
        let tun_service_path = std::path::PathBuf::from(&tun_service_path_str);

        use aurestream_plugin_tun::scm::{self, Freshness};
        let freshness = scm::check_freshness(&tun_service_path);
        match freshness {
            Freshness::MissingService | Freshness::NeedsUpgrade => {
                log::info!(
                    "[win] tun-service is missing or needs upgrade ({:?}), attempting elevated installation via UAC",
                    freshness
                );
                aurestream_plugin_privilege::windows::run_elevated_install(&tun_service_path)?;
            }
            Freshness::UpToDate => {
                log::info!("[win] tun-service is up to date");
            }
            Freshness::MissingBinary => {
                return Err(format!(
                    "Bundled tun-service binary not found at {}",
                    tun_service_path.display()
                ));
            }
        }
        Ok(())
    }

    async fn uninstall_service(_app: &AppHandle) -> Result<(), String> {
        let tun_service_path_str =
            crate::engine::helper::get_sidecar_path(std::path::Path::new("tun-service"))
                .map_err(|e| format!("Failed to get sidecar path: {}", e))?;
        let tun_service_path = std::path::PathBuf::from(&tun_service_path_str);
        aurestream_plugin_privilege::windows::run_elevated_uninstall(&tun_service_path)
    }

    async fn probe(_app: &AppHandle) -> Result<String, String> {
        use aurestream_plugin_tun::scm::{self, QueriedState};
        let state = scm::query_state();
        if matches!(state, QueriedState::NotInstalled) {
            Err("Not installed".into())
        } else {
            Ok("available".into())
        }
    }
}
