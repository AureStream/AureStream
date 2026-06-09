use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
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

            // Resolve the paths using the standard Tauri v2 sidecar layout
            let gateway = crate::engine::helper::extract_tun_gateway_from_config(&config_path)
                .unwrap_or_else(|| "-".to_string());

            let core_path_str = crate::engine::helper::get_sidecar_path(std::path::Path::new("aurestream-core"))
                .map_err(|e| format!("Failed to get sidecar path: {}", e))?;

            let config_path_str = config_path.as_str();
            let args = [config_path_str, &gateway, &core_path_str];

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
                .sidecar("aurestream-core")
                .map_err(|e| format!("sidecar lookup failed: {}", e))?
                .args(["run", "-c", &config_path, "--disable-color"]);
            let (rx, child) = cmd.spawn().map_err(|e| format!("spawn failed: {}", e))?;
            let child_pid = child.pid();
            log::info!("[aurestream-core] spawned pid={} mode={:?}", child_pid, mode);

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
        }

        if matches!(mode.as_ref(), ProxyMode::SystemProxy) {
            crate::engine::common::shutdown::wait_for_sidecar_ports_release(app).await;
        } else if child_pid_for_log.is_none() {
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

        let start_epoch = app
            .state::<crate::engine::state_machine::EngineStateCell>()
            .snapshot()
            .epoch();
        let mixed_port = crate::core::mixed_proxy_port(app);
        Self::stop(app).await?;

        let release_deadline =
            std::time::Instant::now() + std::time::Duration::from_secs(5);
        while std::time::Instant::now() < release_deadline
            && crate::core::probe_port_listening(mixed_port)
        {
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        }

        Self::start(app, mode, config_path, start_epoch).await
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

    async fn ensure_installed(_app: &AppHandle) -> Result<(), String> {
        let tun_service_path_str = crate::engine::helper::get_sidecar_path(std::path::Path::new("tun-service"))
            .map_err(|e| format!("Failed to get sidecar path: {}", e))?;
        let tun_service_path = std::path::PathBuf::from(&tun_service_path_str);

        use tun_service::scm::{self, Freshness};
        let freshness = scm::check_freshness(&tun_service_path);
        match freshness {
            Freshness::MissingService | Freshness::NeedsUpgrade => {
                log::info!(
                    "[win] tun-service is missing or needs upgrade ({:?}), attempting elevated installation via UAC",
                    freshness
                );
                Self::run_elevated_install(&tun_service_path)?;
            }
            Freshness::UpToDate => {
                log::info!("[win] tun-service is up to date");
            }
            Freshness::MissingBinary => {
                return Err(format!("Bundled tun-service binary not found at {}", tun_service_path.display()));
            }
        }
        Ok(())
    }

    async fn uninstall_service(_app: &AppHandle) -> Result<(), String> {
        let tun_service_path_str = crate::engine::helper::get_sidecar_path(std::path::Path::new("tun-service"))
            .map_err(|e| format!("Failed to get sidecar path: {}", e))?;
        let tun_service_path = std::path::PathBuf::from(&tun_service_path_str);
        Self::run_elevated_uninstall(&tun_service_path)
    }

    async fn probe(_app: &AppHandle) -> Result<String, String> {
        use tun_service::scm::{self, QueriedState};
        let state = scm::query_state();
        if matches!(state, QueriedState::NotInstalled) {
            Err("Not installed".into())
        } else {
            Ok("available".into())
        }
    }
}

impl WindowsEngine {
    /// Launch `tun-service.exe install <bundled_path>` with a UAC elevation
    /// prompt (`runas` verb). This avoids requiring the entire app to run as
    /// Administrator — only the service installation step is elevated.
    fn run_elevated_install(bundled_exe: &std::path::Path) -> Result<(), String> {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;

        use windows::Win32::Foundation::{CloseHandle, WAIT_OBJECT_0};
        use windows::Win32::System::Threading::{
            GetExitCodeProcess, WaitForSingleObject, INFINITE,
        };
        use windows::Win32::UI::Shell::{ShellExecuteExW, SHELLEXECUTEINFOW, SEE_MASK_NOCLOSEPROCESS};

        if !bundled_exe.exists() {
            return Err(format!(
                "bundled service exe does not exist: {}",
                bundled_exe.display()
            ));
        }

        let verb: Vec<u16> = OsStr::new("runas\0").encode_wide().collect();
        let file: Vec<u16> = bundled_exe.as_os_str().encode_wide().chain(Some(0)).collect();
        let params_str = format!("install \"{}\"", bundled_exe.display());
        let params: Vec<u16> = OsStr::new(&params_str).encode_wide().chain(Some(0)).collect();

        let mut sei = SHELLEXECUTEINFOW {
            cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
            fMask: SEE_MASK_NOCLOSEPROCESS,
            lpVerb: windows::core::PCWSTR(verb.as_ptr()),
            lpFile: windows::core::PCWSTR(file.as_ptr()),
            lpParameters: windows::core::PCWSTR(params.as_ptr()),
            nShow: 0, // SW_HIDE
            ..Default::default()
        };

        let ok = unsafe { ShellExecuteExW(&mut sei) };
        if !ok.is_ok() {
            return Err(
                "UAC elevation was cancelled or failed. The TUN service requires a one-time \
                 Administrator approval to install. Please try again and accept the UAC prompt."
                    .into(),
            );
        }

        let process = sei.hProcess;
        if process.is_invalid() {
            return Err("ShellExecuteExW succeeded but returned invalid process handle".into());
        }

        // Wait for the elevated process to finish.
        let wait_result = unsafe { WaitForSingleObject(process, INFINITE) };
        if wait_result != WAIT_OBJECT_0 {
            unsafe { let _ = CloseHandle(process); }
            return Err(format!(
                "WaitForSingleObject returned unexpected value: {:?}",
                wait_result
            ));
        }

        let mut exit_code: u32 = 1;
        let _ = unsafe { GetExitCodeProcess(process, &mut exit_code) };
        unsafe { let _ = CloseHandle(process); }

        if exit_code != 0 {
            return Err(format!(
                "Elevated tun-service install failed with exit code {}",
                exit_code
            ));
        }

        log::info!("[win] elevated tun-service install completed successfully");
        Ok(())
    }

    /// Launch `tun-service.exe uninstall` with a UAC elevation prompt (`runas` verb).
    fn run_elevated_uninstall(bundled_exe: &std::path::Path) -> Result<(), String> {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;

        use windows::Win32::Foundation::{CloseHandle, WAIT_OBJECT_0};
        use windows::Win32::System::Threading::{
            GetExitCodeProcess, WaitForSingleObject, INFINITE,
        };
        use windows::Win32::UI::Shell::{ShellExecuteExW, SHELLEXECUTEINFOW, SEE_MASK_NOCLOSEPROCESS};

        if !bundled_exe.exists() {
            return Err(format!(
                "bundled service exe does not exist: {}",
                bundled_exe.display()
            ));
        }

        let verb: Vec<u16> = OsStr::new("runas\0").encode_wide().collect();
        let file: Vec<u16> = bundled_exe.as_os_str().encode_wide().chain(Some(0)).collect();
        let params_str = "uninstall".to_string();
        let params: Vec<u16> = OsStr::new(&params_str).encode_wide().chain(Some(0)).collect();

        let mut sei = SHELLEXECUTEINFOW {
            cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
            fMask: SEE_MASK_NOCLOSEPROCESS,
            lpVerb: windows::core::PCWSTR(verb.as_ptr()),
            lpFile: windows::core::PCWSTR(file.as_ptr()),
            lpParameters: windows::core::PCWSTR(params.as_ptr()),
            nShow: 0, // SW_HIDE
            ..Default::default()
        };

        let ok = unsafe { ShellExecuteExW(&mut sei) };
        if !ok.is_ok() {
            return Err(
                "UAC elevation was cancelled or failed. The TUN service requires Administrator \
                 approval to uninstall. Please try again and accept the UAC prompt."
                    .into(),
            );
        }

        let process = sei.hProcess;
        if process.is_invalid() {
            return Err("ShellExecuteExW succeeded but returned invalid process handle".into());
        }

        // Wait for the elevated process to finish.
        let wait_result = unsafe { WaitForSingleObject(process, INFINITE) };
        if wait_result != WAIT_OBJECT_0 {
            unsafe { let _ = CloseHandle(process); }
            return Err(format!(
                "WaitForSingleObject returned unexpected value: {:?}",
                wait_result
            ));
        }

        let mut exit_code: u32 = 1;
        let _ = unsafe { GetExitCodeProcess(process, &mut exit_code) };
        unsafe { let _ = CloseHandle(process); }

        if exit_code != 0 {
            return Err(format!(
                "Elevated tun-service uninstall failed with exit code {}",
                exit_code
            ));
        }

        log::info!("[win] elevated tun-service uninstall completed successfully");
        Ok(())
    }
}
