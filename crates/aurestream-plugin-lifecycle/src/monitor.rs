use std::sync::Arc;
use tauri::Emitter;
use tauri::Manager;

use crate::log::{create_singbox_log_writer, write_singbox_log};
use crate::process::ProcessManager;
use crate::state_machine::{transition, EngineState, EngineStateCell, Intent};
use crate::{EngineManager, PlatformEngine, ProxyMode, EVENT_STATUS_CHANGED, EVENT_TAURI_LOG};

pub(crate) fn spawn_process_monitor(
    app: tauri::AppHandle,
    mut rx: tauri::async_runtime::Receiver<tauri_plugin_shell::process::CommandEvent>,
    mode: Arc<ProxyMode>,
    child_pid: u32,
    spawn_epoch: u64,
) {
    let mut singbox_log = create_singbox_log_writer(&app);
    let spawn_at = std::time::Instant::now();
    log::info!(
        "[sing-box] monitor attached pid={} mode={:?}",
        child_pid,
        mode
    );
    tokio::spawn(async move {
        let mut terminated = false;

        while let Some(event) = rx.recv().await {
            if terminated {
                if let tauri_plugin_shell::process::CommandEvent::Stdout(line)
                | tauri_plugin_shell::process::CommandEvent::Stderr(line) = event
                {
                    let line_str = String::from_utf8_lossy(&line);
                    write_singbox_log(&mut singbox_log, &line_str);
                }
                continue;
            }
            match event {
                tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                    let line_str = String::from_utf8_lossy(&line);
                    write_singbox_log(&mut singbox_log, &line_str);
                }
                tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                    let line_str = String::from_utf8_lossy(&line);
                    write_singbox_log(&mut singbox_log, &line_str);
                    scan_stderr_for_bind_error(child_pid, &line_str);
                    let _ = app.emit(EVENT_TAURI_LOG, (0, line_str.to_string()));
                }
                tauri_plugin_shell::process::CommandEvent::Error(err) => {
                    log::error!("[sing-box] pid={} process error: {}", child_pid, err);
                    write_singbox_log(&mut singbox_log, &format!("[ERROR] {}", err));
                    let _ = app.emit(EVENT_TAURI_LOG, (1, err.to_string()));
                }
                tauri_plugin_shell::process::CommandEvent::Terminated(payload) => {
                    terminated = true;
                    let runtime = spawn_at.elapsed();
                    log::info!(
                        "[sing-box] pid={} terminated runtime={:.2}s code={:?} signal={:?}",
                        child_pid,
                        runtime.as_secs_f64(),
                        payload.code,
                        payload.signal
                    );
                    #[allow(unused_variables)]
                    let adjusted_payload = {
                        #[cfg(target_os = "windows")]
                        {
                            let is_stopping = {
                                let manager = ProcessManager::acquire();
                                manager.is_stopping
                            };
                            if is_stopping && payload.code == Some(1) {
                                log::info!(
                                    "[monitor] windows code remap applied orig_code=1 new_code=0 is_stopping=true pid={}",
                                    child_pid
                                );
                                tauri_plugin_shell::process::TerminatedPayload {
                                    code: Some(0),
                                    signal: payload.signal,
                                }
                            } else {
                                payload
                            }
                        }
                        #[cfg(not(target_os = "windows"))]
                        payload
                    };
                    handle_process_termination(&app, &mode, adjusted_payload, spawn_epoch).await;
                }
                _ => {}
            }
        }
    });
}

fn scan_stderr_for_bind_error(pid: u32, line: &str) {
    let lc = line.to_ascii_lowercase();
    if lc.contains("address already in use") || lc.contains("eaddrinuse") {
        log::warn!("[sing-box] pid={} BIND FAILED: {}", pid, line.trim_end());
    } else if lc.contains("listen tcp") && lc.contains("bind:") {
        log::warn!("[sing-box] pid={} listener error: {}", pid, line.trim_end());
    }
}

#[inline]
pub(crate) fn epoch_guard_stale(spawn_epoch: u64, current_epoch: u64) -> bool {
    spawn_epoch != current_epoch
}

pub(crate) async fn handle_process_termination(
    app_handle: &tauri::AppHandle,
    process_mode: &Arc<ProxyMode>,
    payload: tauri_plugin_shell::process::TerminatedPayload,
    spawn_epoch: u64,
) {
    let current_epoch = app_handle.state::<EngineStateCell>().snapshot().epoch();
    let is_stale = epoch_guard_stale(spawn_epoch, current_epoch);
    if is_stale {
        log::info!(
            "[monitor] guard: stale epoch captured={} current={} mode={:?} code={:?} — skipping cleanup",
            spawn_epoch, current_epoch, process_mode, payload.code
        );
    }

    #[cfg(target_os = "macos")]
    let is_watchdog_restart = crate::macos_watchdog::is_restart_in_progress();
    #[cfg(not(target_os = "macos"))]
    let is_watchdog_restart = false;

    if is_watchdog_restart {
        log::info!(
            "[handle_process_termination] bypass_router_watchdog restart in progress, skipping cleanup but preserving state transition"
        );
    }

    let (pm_pid, manager_mode, matches, is_stopping) = {
        let manager = ProcessManager::acquire();
        let pm_pid = manager.child.as_ref().map(|c| c.pid());
        let manager_mode = manager.mode.as_ref().map(|m| (**m).clone());
        let matches = manager
            .mode
            .as_ref()
            .map(|m| **m == **process_mode)
            .unwrap_or(false);
        let is_stopping = manager.is_stopping;
        (pm_pid, manager_mode, matches, is_stopping)
    };
    let engine_state = app_handle.state::<EngineStateCell>().snapshot();
    log::info!(
        "[monitor] handle_process_termination entry pid={:?} code={:?} signal={:?} is_stopping={} process_mode={:?} manager_mode={:?} engine_state={}",
        pm_pid, payload.code, payload.signal, is_stopping,
        process_mode, manager_mode, engine_state.kind()
    );

    let (should_cleanup, was_user_initiated_stop) = if matches {
        log::info!("Cleaning up resources after process termination");
        (true, is_stopping)
    } else {
        (false, false)
    };

    if should_cleanup && !is_stale && !is_watchdog_restart {
        if matches!(**process_mode, ProxyMode::SystemProxy) {
            if let Err(e) = aurestream_plugin_proxy::sysproxy::clear_system_proxy(app_handle).await {
                log::error!("Failed to unset proxy after process termination: {}", e);
            }
        }

        if matches!(**process_mode, ProxyMode::IntoProxy) {
            PlatformEngine::on_process_terminated(app_handle, was_user_initiated_stop);
        }

        ProcessManager::acquire().reset();
    }


    if let Err(e) = app_handle.emit(EVENT_STATUS_CHANGED, payload.clone()) {
        log::error!("Failed to emit status-changed event: {}", e);
    }

    let cur = app_handle.state::<EngineStateCell>().snapshot();
    match cur {
        EngineState::Stopping { .. } => {
            let _ = transition(app_handle, Intent::MarkIdle);
        }
        EngineState::Running { .. } | EngineState::Starting { .. } => {
            let code = payload.code.unwrap_or(-1);
            if code == 0 {
                let _ = transition(app_handle, Intent::MarkIdle);
            } else {
                let _ = transition(
                    app_handle,
                    Intent::Fail {
                        reason: format!("sing-box exited unexpectedly (code={})", code),
                    },
                );
            }
        }
        _ => {}
    }
}
