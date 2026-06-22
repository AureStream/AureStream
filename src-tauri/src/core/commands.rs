use crate::core::{EVENT_STATUS_CHANGED, EVENT_TAURI_LOG};
use crate::engine::ports::{
    controller_port, mixed_proxy_port, probe_port_bindable, probe_port_listening,
    wait_for_port_bindable, wait_for_port_listening,
};
use crate::engine::process::{pm_snapshot, ProcessManager};
use crate::engine::state_machine::{transition, EngineState, EngineStateCell, Intent};
use crate::engine::{
    config_check, perf, process, readiness, EngineManager, PlatformEngine, ProxyMode,
};

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use tokio::sync::broadcast;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

/// Prevents concurrent `start()` invocations from piling up and corrupting engine state.
/// Held from the beginning of `start()` until the engine is fully ready or failed.
static START_LOCK: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();

/// Set to true while `stop()` is in progress, so concurrent `start()` calls can
/// detect it and abort early with a clear error.
static STOP_IN_PROGRESS: AtomicBool = AtomicBool::new(false);

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

/// Always ask the privileged helper to release sing-box (TUN mode runs as root).
#[cfg(target_os = "macos")]
async fn stop_helper_managed_sing_box(mixed_port: u16, ctrl_port: u16) {
    ::log::info!("[start] ensuring helper-managed sing-box is stopped");
    // ensure_port_free_with_retry kills processes in ALL TCP states via the
    // root helper, then polls TcpListener::bind to confirm the port is free.
    if let Err(e) = crate::engine::ports::ensure_port_free_with_retry(
        mixed_port,
        Duration::from_secs(8),
    )
    .await
    {
        ::log::error!("[start] mixed :{mixed_port} cleanup: {e}");
    }
    if ctrl_port != mixed_port {
        if let Err(e) = crate::engine::ports::ensure_port_free_with_retry(
            ctrl_port,
            Duration::from_secs(8),
        )
        .await
        {
            ::log::error!("[start] controller :{ctrl_port} cleanup: {e}");
        }
    }
}

#[cfg(not(target_os = "macos"))]
async fn stop_helper_managed_sing_box(_mixed_port: u16, _ctrl_port: u16) {}

async fn ensure_proxy_ports_free(app: &AppHandle) {
    let mixed_port = mixed_proxy_port(app);
    let ctrl_port = controller_port(app);

    // Delegate port cleanup to the privileged helper (root) when available.
    // On macOS this kills processes in ALL TCP states and polls bindability.
    // On other platforms it polls TcpListener::bind with a timeout.
    stop_helper_managed_sing_box(mixed_port, ctrl_port).await;

    // Also run user-level kill_orphans as belt-and-suspenders for any
    // user-owned processes the helper may have missed.
    for &port in &[mixed_port, ctrl_port] {
        let res = aurestream_plugin_privilege::free_port(port);
        ::log::info!("[start] prestart :{port}: {}", res.message);
    }

    // Final hard check: ports MUST be bindable before we spawn sing-box.
    // If ports are still blocked after all cleanup, fail fast instead of
    // "proceeding anyway" and letting sing-box crash with BIND FAILED.
    let mixed_bindable = wait_for_port_bindable(mixed_port, Duration::from_secs(5)).await;
    if !mixed_bindable {
        ::log::warn!("[start] mixed :{mixed_port} not bindable after all cleanup, proceeding anyway");
    }
    if ctrl_port != mixed_port {
        let ctrl_bindable = wait_for_port_bindable(ctrl_port, Duration::from_secs(5)).await;
        if !ctrl_bindable {
            ::log::warn!("[start] controller :{ctrl_port} not bindable after all cleanup, proceeding anyway");
        }
    }
}

// ── Tauri Commands ────────────────────────────────────────────────────

#[tauri::command]
pub async fn start(app: tauri::AppHandle, path: String, mode: ProxyMode) -> Result<(), String> {
    let action = next_action_token();

    // ── Concurrency guard: only one start() can proceed at a time. ──────
    // Takes the lock BEFORE logging, so that concurrent callers queue up
    // instead of interleaving their port-cleanup / state-transition steps.
    let _start_guard = {
        let lock = START_LOCK.get_or_init(|| tokio::sync::Mutex::new(()));
        lock.lock().await
    };

    // If another start() already succeeded while we were waiting, don't touch it.
    {
        let cur = app.state::<EngineStateCell>().snapshot();
        if matches!(cur, EngineState::Running { .. }) {
            ::log::info!(
                "[start] action={action} engine already running, skipping"
            );
            return Ok(());
        }
        if matches!(cur, EngineState::Starting { .. }) {
            ::log::info!(
                "[start] action={action} engine already starting, skipping"
            );
            return Ok(());
        }
        if STOP_IN_PROGRESS.load(Ordering::Acquire) {
            return Err("engine is currently stopping, please retry".into());
        }
    }

    let mode_name = match mode {
        ProxyMode::SystemProxy => "系统代理 (SystemProxy)",
        ProxyMode::IntoProxy => "TUN虚拟网卡 (IntoProxy)",
    };
    ::log::info!("[start] action={action} 启动代理服务，模式: {}", mode_name);
    let _ = app.emit(
        EVENT_TAURI_LOG,
        (0, format!("启动代理服务，模式: {}", mode_name)),
    );

    // Invalidate config_check cache when the proxy mode changed since last
    // start, so `config.json` is always re-verified after a mode switch
    // (prevents stale TUN-inbound config from being used in SystemProxy mode).
    {
        let prev_mode = {
            let mgr = ProcessManager::acquire();
            mgr.mode.as_ref().map(|m| m.as_ref().clone())
        };
        if let Some(ref prev) = prev_mode {
            if *prev != mode {
                ::log::info!(
                    "[start] action={action} mode changed {:?} -> {:?}, invalidating config cache",
                    prev, mode
                );
                config_check::invalidate_cache();
            }
        }
    }

    {
        let _step = perf::StepTimer::new("start.ensure_ports_free");
        ensure_proxy_ports_free(&app).await;
    }

    // After the (potentially long) port cleanup, re-check that no concurrent
    // start raced ahead and transitioned the state while we waited.
    {
        let cur = app.state::<EngineStateCell>().snapshot();
        if matches!(cur, EngineState::Running { .. }) {
            ::log::info!(
                "[start] action={action} engine already running after port cleanup, skipping"
            );
            return Ok(());
        }
        if matches!(cur, EngineState::Starting { .. }) {
            ::log::info!(
                "[start] action={action} engine already starting after port cleanup, skipping"
            );
            return Ok(());
        }
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

    // 保存用户选择的模式，供托盘菜单恢复选中状态
    let mode_key = match mode {
        ProxyMode::IntoProxy => "tun",
        ProxyMode::SystemProxy => "system",
    };
    {
        use tauri_plugin_store::StoreExt;
        if let Ok(store) = app.store("settings.json") {
            let _ = store.set("last_proxy_mode", serde_json::Value::String(mode_key.to_string()));
            store.save().ok();
        }
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

    // Subscribe to readiness BEFORE starting the engine so we don't miss the signal.
    let mut ready_rx = crate::engine::readiness::subscribe_ready();

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

    let (post_pid, post_alive, _) = pm_snapshot();
    ::log::info!(
        "[start] action={action} spawn returned, handing off to readiness prober (pm_child_pid={:?} alive={:?})",
        post_pid, post_alive
    );
    readiness::spawn(app.clone(), start_epoch);

    // Wait for the readiness prober to confirm sing-box is listening.
    match tokio::time::timeout(
        std::time::Duration::from_secs(12),
        ready_rx.recv(),
    )
    .await
    {
        Ok(Ok(readiness::Readiness::Ready)) => {
            ::log::info!("[start] action={action} readiness confirmed");
        }
        Ok(Ok(readiness::Readiness::Failed)) => {
            ::log::error!("[start] action={action} readiness prober reported failure");
            return Err("startup failed: ports not reachable".into());
        }
        Ok(Err(broadcast::error::RecvError::Lagged(_))) => {
            ::log::info!("[start] action={action} readiness signal lagged, assuming ready");
        }
        Ok(Err(broadcast::error::RecvError::Closed)) => {
            ::log::warn!("[start] action={action} readiness channel closed unexpectedly");
            return Err("readiness channel closed".into());
        }
        Err(_timeout) => {
            ::log::error!("[start] action={action} readiness timeout");
            let _ = transition(
                &app,
                Intent::Fail {
                    reason: "startup timeout: sing-box did not become ready".into(),
                },
            );
            return Err("startup timeout: sing-box did not become ready".into());
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn stop(app: tauri::AppHandle) -> Result<(), String> {
    let action = next_action_token();
    STOP_IN_PROGRESS.store(true, Ordering::Release);
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
    let port_bindable = probe_port_bindable(mixed_port);
    if !port_bindable {
        ::log::warn!(
            "[stop] action={action} returning with :{mixed_port} STILL NOT BINDABLE — pm_child_pid={:?} may have survived",
            pm_pid
        );
    } else {
        ::log::info!("[stop] action={action} returned, :{mixed_port} released");
    }
    app.emit(EVENT_STATUS_CHANGED, ()).ok();
    STOP_IN_PROGRESS.store(false, Ordering::Release);
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
            let path = manager.config_path.as_ref().map(|p| p.as_str().to_string());
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
            if let Err(e) = aurestream_plugin_proxy::sysproxy::set_system_proxy(
                crate::engine::ports::mixed_proxy_port(&app),
                crate::engine::resolve_proxy_bypass(&app),
            )
            .await
            {
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
