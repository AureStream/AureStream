//! AureStream v2 Tauri shell — auth + subscriptions + engine event bus + tray.

mod commands;
mod logging;
mod node_key;
mod persist;
mod state;
mod tray;
mod window_util;

use commands::{
    auth_login, auth_logout, auth_register, auth_restore, auth_verify, cleanup_on_exit,
    engine_get_state, engine_probe_tun, engine_select_node, engine_start, engine_stop,
    engine_uninstall_helper, ping_tcp, reconcile_persisted_state, reconcile_stale_runtime,
    spawn_engine_health_monitor,
    spawn_traffic_reporter, spawn_traffic_sampler, subs_list, subs_sync, EngineAppState,
};
use state::{AuthState, SubsState};
use tauri::{Manager, RunEvent, WindowEvent};
use tray::TrayState;
use window_util::hide_main_window;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Register first so a second process exits before engine/proxy setup.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            log::info!("second instance launched — focusing existing window");
            window_util::show_main_window(app);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(logging::plugin())
        .manage(TrayState::new())
        .setup(|app| {
            let handle = app.handle().clone();
            logging::spawn_log_maintenance(&handle);
            if let Ok(dir) = logging::app_log_dir(&handle) {
                log::info!(
                    "logging ready dir={} app={}.log core={}*.log",
                    dir.display(),
                    logging::APP_LOG_FILE_STEM,
                    logging::CORE_LOG_PREFIX
                );
            }
            let auth_state = AuthState::load(&handle)?;
            let subs_state = SubsState::load(&handle)?;
            let engine_state = EngineAppState::load(&handle)?;
            reconcile_stale_runtime(&engine_state);
            reconcile_persisted_state(&subs_state, &engine_state);
            handle.manage(auth_state);
            handle.manage(subs_state);
            handle.manage(engine_state);
            spawn_engine_health_monitor(&handle);
            spawn_traffic_sampler(&handle);
            spawn_traffic_reporter(&handle);

            if let Err(e) = tray::setup_tray(app) {
                log::error!("system tray setup failed: {e}");
            }

            log::info!("app setup complete");
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            if let WindowEvent::CloseRequested { api, .. } = event {
                // Official tray pattern: prevent destroy, hide to tray.
                // <https://v2.tauri.app/zh-cn/learn/system-tray/>
                api.prevent_close();
                hide_main_window(window.app_handle());
            }
        })
        .invoke_handler(tauri::generate_handler![
            auth_login,
            auth_register,
            auth_verify,
            auth_logout,
            auth_restore,
            subs_sync,
            subs_list,
            engine_start,
            engine_stop,
            engine_select_node,
            engine_get_state,
            engine_probe_tun,
            engine_uninstall_helper,
            ping_tcp,
        ])
        .build(tauri::generate_context!())
        .expect("error while building AureStream")
        .run(|app_handle, event| {
            match event {
                // Stay alive when the last window is hidden (no exit code).
                // Tray "退出应用" calls app.exit(0) which supplies a code.
                RunEvent::ExitRequested { api, code, .. } => {
                    if code.is_none() {
                        api.prevent_exit();
                        log::debug!("exit prevented — staying in tray");
                    }
                }
                #[cfg(target_os = "macos")]
                RunEvent::Reopen {
                    has_visible_windows,
                    ..
                } => {
                    if !has_visible_windows {
                        window_util::show_main_window(app_handle);
                    }
                }
                RunEvent::Exit => {
                    log::info!("app exiting — cleaning engine runtime");
                    cleanup_on_exit(app_handle);
                    // Keep handle referenced on non-macOS (Reopen is mac-only).
                    let _ = &app_handle;
                }
                _ => {}
            }
        });
}
