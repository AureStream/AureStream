use std::sync::Arc;
use tauri::AppHandle;
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_shell::ShellExt;

use crate::core::monitor::spawn_process_monitor;
use crate::core::ProcessManager;
use crate::engine::sysproxy::{clear_system_proxy, set_system_proxy};
use crate::engine::{EngineManager, ProxyMode, EVENT_TAURI_LOG};

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
            // First, make sure the service is installed
            Self::ensure_installed(app).await?;

            // Resolve the paths
            let triple = if cfg!(target_arch = "aarch64") {
                "aarch64-pc-windows-msvc"
            } else {
                "x86_64-pc-windows-msvc"
            };
            let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
            let sing_box_path = resource_dir.join(format!("binaries/sing-box-{}.exe", triple));

            let config_path_str = config_path.as_str();
            let sing_box_path_str = sing_box_path.to_string_lossy();
            let args = [config_path_str, "-", &sing_box_path_str];

            log::info!("[win] starting AureStreamTunService with args: {:?}", args);
            tun_service::scm::start_service_with_args(&args).map_err(|e| {
                format!("Failed to start AureStream TUN Service: {}", e)
            })?;

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
                .sidecar("sing-box")
                .map_err(|e| format!("sidecar lookup failed: {}", e))?
                .args(["run", "-c", &config_path, "--disable-color"]);
            let (rx, child) = cmd.spawn().map_err(|e| format!("spawn failed: {}", e))?;
            let child_pid = child.pid();
            log::info!("[sing-box] spawned pid={} mode={:?}", child_pid, mode);

            spawn_process_monitor(
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
                if let Err(e) = set_system_proxy(app).await {
                    let _ =
                        app.emit(EVENT_TAURI_LOG, (2, format!("Failed to set proxy: {}", e)));
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
            (mgr.mode.clone(), mgr.child.take())
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
            if let Err(e) = clear_system_proxy(app).await {
                log::warn!("Failed to unset proxy: {}", e);
                let _ = app.emit(
                    EVENT_TAURI_LOG,
                    (2, format!("Failed to unset proxy: {}", e)),
                );
            }
        }

        if matches!(mode.as_ref(), ProxyMode::IntoProxy) {
            log::info!("[win-stop] stopping AureStreamTunService");
            if let Err(e) = tun_service::scm::stop_service() {
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
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        } else {
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            log::info!("[win-stop] post_kill_alive_check skipped reason=no_child_pid");
        }

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

        Self::stop(app).await?;
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        Self::start(app, mode, config_path, 0).await
    }

    fn on_process_terminated(app: &AppHandle, _was_user_stop: bool) {
        log::info!("[win] process terminated, clearing system proxy");
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            if let Err(e) = clear_system_proxy(&app).await {
                log::warn!("[win] failed to clear system proxy on termination: {}", e);
            }
        });
    }

    async fn ensure_installed(app: &AppHandle) -> Result<(), String> {
        let triple = if cfg!(target_arch = "aarch64") {
            "aarch64-pc-windows-msvc"
        } else {
            "x86_64-pc-windows-msvc"
        };
        let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
        let tun_service_path = resource_dir.join(format!("binaries/tun-service-{}.exe", triple));

        use tun_service::scm::{self, QueriedState};
        let state = scm::query_state();
        if matches!(state, QueriedState::NotInstalled) {
            log::info!("[win] tun-service is not installed, attempting installation (requires elevation)");
            scm::ensure_installed(&tun_service_path).map_err(|e| {
                format!(
                    "AureStream TUN Service is not installed. Please run the app as Administrator once to install the service, or reinstall the application. Details: {}",
                    e
                )
            })?;
        } else {
            if let Err(e) = scm::ensure_installed(&tun_service_path) {
                log::warn!("[win] failed to update/verify tun-service: {}. Proceeding with existing service.", e);
            }
        }
        Ok(())
    }

    async fn probe(_app: &AppHandle) -> Result<String, String> {
        Ok("available".into())
    }
}
