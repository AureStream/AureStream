pub(crate) mod log;
pub(crate) mod monitor;

pub use self::log::cleanup_old_app_logs;

use lazy_static::lazy_static;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

use crate::app::state::AppData;
use crate::engine::state_machine::{transition, EngineState, EngineStateCell, Intent};
use crate::engine::{readiness, EVENT_STATUS_CHANGED};
use crate::engine::{EngineManager, PlatformEngine};
use tauri::Emitter;
use tauri_plugin_shell::process::CommandChild;

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

pub(crate) const DEFAULT_MIXED_PROXY_PORT: u16 = 2345;

pub(crate) fn mixed_proxy_port(app: &AppHandle) -> u16 {
    use tauri_plugin_store::StoreExt;
    app.get_store("settings.json")
        .and_then(|s| s.get("proxy_port_key"))
        .and_then(|v| v.as_u64())
        .and_then(|port| u16::try_from(port).ok())
        .filter(|port| *port > 0)
        .unwrap_or(DEFAULT_MIXED_PROXY_PORT)
}

pub(crate) fn probe_port_listening(port: u16) -> bool {
    use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpStream};
    let addr = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port);
    TcpStream::connect_timeout(&addr, Duration::from_millis(100)).is_ok()
}

#[cfg(unix)]
pub(crate) fn pid_is_alive(pid: u32) -> bool {
    unsafe { libc::kill(pid as i32, 0) == 0 }
}

#[cfg(not(unix))]
pub(crate) fn pid_is_alive(_pid: u32) -> bool {
    true
}

fn pm_snapshot() -> (Option<u32>, Option<bool>, Option<ProxyMode>) {
    let mgr = ProcessManager::acquire();
    let pid = mgr.child.as_ref().map(|c| c.pid());
    let alive = pid.map(pid_is_alive);
    let mode = mgr.mode.as_ref().map(|m| (**m).clone());
    (pid, alive, mode)
}

pub use crate::engine::ProxyMode;

pub(crate) struct ProcessManager {
    pub(crate) child: Option<CommandChild>,
    pub(crate) mode: Option<Arc<ProxyMode>>,
    pub(crate) config_path: Option<Arc<String>>,
    pub(crate) is_stopping: bool,
}

impl ProcessManager {
    pub(crate) fn acquire() -> std::sync::MutexGuard<'static, ProcessManager> {
        PROCESS_MANAGER.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub(crate) fn reset(&mut self) {
        self.child = None;
        self.mode = None;
        self.config_path = None;
        self.is_stopping = false;
    }
}

lazy_static! {
    pub(crate) static ref PROCESS_MANAGER: Arc<Mutex<ProcessManager>> =
        Arc::new(Mutex::new(ProcessManager {
            child: None,
            mode: None,
            config_path: None,
            is_stopping: false,
        }));
}

// ── Tauri Commands ────────────────────────────────────────────────────

#[tauri::command]
pub async fn start(app: tauri::AppHandle, path: String, mode: ProxyMode) -> Result<(), String> {
    let action = next_action_token();
    let (_pm_pid, _pm_alive, _pm_mode) = pm_snapshot();
    let mixed_port = mixed_proxy_port(&app);
    let _port_listening = probe_port_listening(mixed_port);
    let _cur_state_kind = app.state::<EngineStateCell>().snapshot().kind();
    let mode_name = match mode {
        ProxyMode::SystemProxy => "系统代理 (SystemProxy)",
        ProxyMode::ManualProxy => "手动代理 (ManualProxy)",
        ProxyMode::IntoProxy => "TUN虚拟网卡 (IntoProxy)",
    };
    ::log::info!("[start] 启动代理服务，模式: {}", mode_name);
    let _ = app.emit(crate::engine::EVENT_TAURI_LOG, (0, format!("启动代理服务，模式: {}", mode_name)));

    // Automatically check and kill any orphan/remnant processes occupying the target port before starting
    let kill_res = crate::commands::prestart::kill_orphans(app.clone(), Some(mixed_port));
    ::log::info!("[start] Prestart orphan check: {}", kill_res.message);

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
        ProxyMode::SystemProxy | ProxyMode::ManualProxy => "mixed",
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

    if let Err(e) = PlatformEngine::start(&app, mode.clone(), path, start_epoch).await {
        ::log::error!(
            "[start] action={action} PlatformEngine::start failed: {}",
            e
        );
        let _ = PlatformEngine::stop(&app).await;
        ProcessManager::acquire().reset();
        let _ = transition(&app, Intent::Fail { reason: e.clone() });
        return Err(e);
    }

    tokio::time::sleep(PlatformEngine::start_settle_delay(&mode)).await;
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
pub async fn is_running(app: AppHandle, secret: String) -> bool {
    let app_data = app.state::<AppData>();
    app_data.set_clash_secret(Some(secret));
    let state = app.state::<EngineStateCell>().snapshot();
    matches!(state, EngineState::Running { .. })
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

#[allow(dead_code)]
#[cfg(any(target_os = "macos", target_os = "windows"))]
pub fn get_running_config() -> Option<(ProxyMode, String)> {
    let manager = ProcessManager::acquire();
    match (manager.mode.as_ref(), manager.config_path.as_ref()) {
        (Some(mode), Some(path)) => Some(((**mode).clone(), (**path).clone())),
        _ => None,
    }
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
        let needs_proxy_reset = {
            let manager = ProcessManager::acquire();
            match manager.mode.as_ref().map(|m| m.as_ref()) {
                Some(ProxyMode::IntoProxy) => false,
                Some(ProxyMode::SystemProxy) => true,
                Some(ProxyMode::ManualProxy) => false,
                None => {
                    ::log::warn!("[reload] action={action} rejected: no running process");
                    return Err("No running process found".to_string());
                }
            }
        };

        ::log::info!("[reload] action={action} dispatching PlatformEngine::restart");
        PlatformEngine::restart(&app).await?;

        if needs_proxy_reset {
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
            if let Err(e) = crate::engine::apply_system_proxy(&app).await {
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
