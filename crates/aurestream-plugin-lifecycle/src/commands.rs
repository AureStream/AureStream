use crate::ports::{
    controller_port, mixed_proxy_port, probe_port_listening, wait_for_port_listening,
};
use crate::process::{pm_snapshot, ProcessManager};
use crate::state_machine::{transition, EngineState, EngineStateCell, Intent};
use crate::{config_check, perf, process, readiness, EngineManager, PlatformEngine, ProxyMode};
use crate::{EVENT_STATUS_CHANGED, EVENT_TAURI_LOG};

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

use tauri::Emitter;

pub(crate) fn next_action_token() -> u64 {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    COUNTER.fetch_add(1, Ordering::Relaxed)
}

fn note_reload_entry() -> Option<Duration> {
    static LAST: OnceLock<Mutex<Option<Instant>>> = OnceLock::new();
    let slot = LAST.get_or_init(|| Mutex::new(None));
    let mut guard = slot.lock().unwrap_or_else(|e| e.into_inner());
    let elapsed = guard.map(|t| t.elapsed());
    *guard = Some(Instant::now());
    elapsed
}

fn clear_orphans_on_proxy_ports_if_needed(app: &AppHandle) {
    let mixed_port = mixed_proxy_port(app);
    if probe_port_listening(mixed_port) {
        let res = aurestream_plugin_privilege::kill_orphans(app.clone(), Some(mixed_port));
        ::log::info!("[start] prestart mixed :{mixed_port}: {}", res.message);
    } else {
        ::log::info!("[start] mixed :{mixed_port} free, skipping orphan cleanup");
    }

    let ctrl_port = controller_port(app);
    if ctrl_port != mixed_port {
        if probe_port_listening(ctrl_port) {
            let res = aurestream_plugin_privilege::kill_orphans(app.clone(), Some(ctrl_port));
            ::log::info!("[start] prestart controller :{ctrl_port}: {}", res.message);
        } else {
            ::log::info!("[start] controller :{ctrl_port} free, skipping orphan cleanup");
        }
    }
}

// ── Tauri Commands ────────────────────────────────────────────────────

#[tauri::command]
pub async fn start(app: tauri::AppHandle, path: String, mode: ProxyMode) -> Result<(), String> {
    let action = next_action_token();
    let mode_name = match mode {
        ProxyMode::SystemProxy => "系统代理 (SystemProxy)",
        ProxyMode::IntoProxy => "TUN虚拟网卡 (IntoProxy)",
    };
    ::log::info!("[start] 启动代理服务，模式: {}", mode_name);
    let _ = app.emit(EVENT_TAURI_LOG, (0, format!("启动代理服务，模式: {}", mode_name)));

    {
        let _step = perf::StepTimer::new("start.clear_orphans");
        clear_orphans_on_proxy_ports_if_needed(&app);
    }

    {
        let cur = app.state::<EngineStateCell>().snapshot();
        if !matches!(cur, EngineState::Idle { .. } | EngineState::Failed { .. }) {
            ::log::warn!(
                "[start] action={action} engine in {} state, forcing MarkIdle before restart",
                cur.kind()
            );
            let _ = transition(&app, Intent::MarkIdle);
        }
    }
    let mode_label = match mode {
        ProxyMode::IntoProxy => "tun",
        ProxyMode::SystemProxy => "mixed",
    };
    if let Err(e) = transition(
        &app,
        Intent::Start {
            mode: mode_label.into(),
        },
    ) {
        return Err(format!("state transition rejected: {}", e));
    }
    let start_epoch = app.state::<EngineStateCell>().snapshot().epoch();

    if config_check::needs_verify(&path) {
        let _step = perf::StepTimer::new("start.config_check");
        if let Err(e) = config_check::verify(&app, &path).await {
            ::log::error!("[start] action={action} config check failed: {}", e);
            let _ = transition(&app, Intent::Fail { reason: e.clone() });
            return Err(e);
        }
    } else {
        ::log::info!("[start] action={action} config unchanged, skipping sing-box check");
    }

    let engine_start = perf::StepTimer::new("start.engine");
    if let Err(e) = PlatformEngine::start(&app, mode.clone(), path, start_epoch).await {
        drop(engine_start);
        ::log::error!(
            "[start] action={action} PlatformEngine::start failed: {}",
            e
        );
        let _ = PlatformEngine::stop(&app).await;
        ProcessManager::acquire().reset();
        let _ = transition(&app, Intent::Fail { reason: e.clone() });
        return Err(e);
    }
    drop(engine_start);

    // tokio::time::sleep(PlatformEngine::start_settle_delay(&mode)).await;
    let (post_pid, post_alive, _) = pm_snapshot();
    ::log::info!(
        "[start] action={action} spawn returned, handing off to readiness prober (pm_child_pid={:?} alive={:?})",
        post_pid, post_alive
    );
    readiness::spawn(app.clone(), start_epoch);
    Ok(())
}

#[tauri::command]
pub async fn stop(app: tauri::AppHandle) -> Result<(), String> {
    let action = next_action_token();
    let (pm_pid, pm_alive, pm_mode) = pm_snapshot();
    let is_stopping_before = ProcessManager::acquire().is_stopping;
    let cur_state_kind = app.state::<EngineStateCell>().snapshot().kind();
    ::log::info!(
        "[stop] action={action} state={} pm_child_pid={:?} pm_child_alive={:?} pm_mode={:?} is_stopping_before={}",
        cur_state_kind, pm_pid, pm_alive, pm_mode, is_stopping_before
    );

    {
        let cur = app.state::<EngineStateCell>().snapshot();
        match cur {
            EngineState::Running { .. } => {
                let _ = transition(&app, Intent::Stop);
            }
            EngineState::Starting { .. } => {
                let _ = transition(&app, Intent::MarkIdle);
            }
            _ => {}
        }
    }

    if let Err(e) = PlatformEngine::stop(&app).await {
        ::log::error!(
            "[stop] action={action} PlatformEngine::stop returned error: {}",
            e
        );
    }

    let post_stop_state = app.state::<EngineStateCell>().snapshot();

    #[cfg(any(target_os = "windows", target_os = "linux"))]
    if matches!(post_stop_state, EngineState::Stopping { .. }) {
        let _ = transition(&app, Intent::MarkIdle);
    }

    if !matches!(
        post_stop_state,
        EngineState::Starting { .. } | EngineState::Running { .. }
    ) {
        ProcessManager::acquire().reset();
    }

    let mixed_port = mixed_proxy_port(&app);
    let port_listening = probe_port_listening(mixed_port);
    if port_listening {
        ::log::warn!(
            "[stop] action={action} returning with :{mixed_port} STILL LISTENING — pm_child_pid={:?} may have survived",
            pm_pid
        );
    } else {
        ::log::info!("[stop] action={action} returned, :{mixed_port} released");
    }
    app.emit(EVENT_STATUS_CHANGED, ()).ok();
    Ok(())
}

#[tauri::command]
pub fn get_engine_state(app: AppHandle) -> EngineState {
    app.state::<EngineStateCell>().snapshot()
}

#[tauri::command]
pub fn clear_engine_error(app: AppHandle) {
    let cur = app.state::<EngineStateCell>().snapshot();
    if matches!(cur, EngineState::Failed { .. }) {
        let _ = transition(&app, Intent::ClearFailure);
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
pub fn get_running_config() -> Option<(ProxyMode, String)> {
    process::running_config()
}

#[tauri::command]
pub async fn reload_config(app: tauri::AppHandle) -> Result<String, String> {
    let action = next_action_token();
    let since_last = note_reload_entry();
    let since_last_str = since_last
        .map(|d| format!("{}ms", d.as_millis()))
        .unwrap_or_else(|| "first".into());
    let (pm_pid, pm_alive, pm_mode) = pm_snapshot();
    let mixed_port = mixed_proxy_port(&app);
    let port_listening = probe_port_listening(mixed_port);
    ::log::info!(
        "[reload] action={action} entry since_last={} pm_child_pid={:?} pm_child_alive={:?} pm_mode={:?} :{mixed_port}_listener={}",
        since_last_str, pm_pid, pm_alive, pm_mode, port_listening
    );

    #[cfg(any(unix, target_os = "windows"))]
    {
        let (needs_proxy_reset, config_path) = {
            let manager = ProcessManager::acquire();
            let path = manager
                .config_path
                .as_ref()
                .map(|p| p.as_str().to_string());
            let needs_proxy_reset = match manager.mode.as_ref().map(|m| m.as_ref()) {
                Some(ProxyMode::IntoProxy) => false,
                Some(ProxyMode::SystemProxy) => true,
                None => {
                    ::log::warn!("[reload] action={action} rejected: no running process");
                    return Err("No running process found".to_string());
                }
            };
            (needs_proxy_reset, path)
        };

        let Some(path) = config_path else {
            return Err("No config path for running process".to_string());
        };

        if config_check::needs_verify(&path) {
            let _step = perf::StepTimer::new("reload.config_check");
            if let Err(e) = config_check::verify(&app, &path).await {
                ::log::error!("[reload] action={action} config check failed: {}", e);
                return Err(e);
            }
        } else {
            ::log::info!("[reload] action={action} config unchanged, skipping sing-box check");
        }

        ::log::info!("[reload] action={action} dispatching PlatformEngine::restart");
        {
            let _step = perf::StepTimer::new("reload.engine_restart");
            PlatformEngine::restart(&app).await?;
        }

        if needs_proxy_reset {
            let _step = perf::StepTimer::new("reload.system_proxy");
            let mixed_port = mixed_proxy_port(&app);
            if !wait_for_port_listening(mixed_port, Duration::from_secs(5)).await {
                ::log::warn!(
                    "[reload] action={action} mixed :{mixed_port} not ready after restart, applying system proxy anyway"
                );
            }
            if let Err(e) = aurestream_plugin_proxy::sysproxy::set_system_proxy(&app, crate::ports::mixed_proxy_port(&app)).await {
                ::log::error!(
                    "[reload] action={action} re-apply system proxy failed: {}",
                    e
                );
                return Err(format!("Config reloaded but failed to reset proxy: {}", e));
            }
        }

        ::log::info!("[reload] action={action} done");
        Ok("Configuration reloaded successfully".to_string())
    }

    #[cfg(not(any(unix, target_os = "windows")))]
    {
        Err("SIGHUP signal is not supported on this platform".to_string())
    }
}
