//! Window / app lifecycle events.
//!
//! Close → tray follows the official Tauri v2 pattern:
//! <https://v2.tauri.app/learn/system-tray/>
//!
//! 1. `WindowEvent::CloseRequested` → `api.prevent_close()` + `window.hide()`
//! 2. `RunEvent::ExitRequested` with no exit code → `api.prevent_exit()` when
//!    the app should stay alive in the tray (so destroying/hiding the last
//!    window does not kill the process)
//! 3. Intentional quit (`AppHandle::exit` / tray "退出") carries an exit code
//!    and is allowed through

use tauri::{AppHandle, Manager, RunEvent, Window, WindowEvent};

use crate::utils::{hide_main_window, minimize_to_tray_enabled};
#[cfg(target_os = "macos")]
use crate::utils::show_main_window;

pub fn on_window_event(window: &Window, event: &WindowEvent) {
    if window.label() != "main" {
        return;
    }

    match event {
        WindowEvent::CloseRequested { api, .. } => {
            if minimize_to_tray_enabled(window.app_handle()) {
                // Official tray pattern: cancel destruction, keep process + hide UI.
                api.prevent_close();
                hide_main_window(window.app_handle());
            } else {
                // Still prevent the default destroy so we can stop the engine
                // cleanly; quit() will call app.exit(0).
                api.prevent_close();
                let handle = window.app_handle().clone();
                tauri::async_runtime::spawn(async move {
                    crate::commands::shell::quit(handle).await;
                });
            }
        }
        WindowEvent::Destroyed => {
            log::info!("[window] main window destroyed");
        }
        _ => {}
    }
}

pub fn on_run_event(app_handle: &AppHandle, event: RunEvent) {
    match event {
        // Keep the process alive when the last window is gone/hidden unless
        // quit() requested an explicit exit code via AppHandle::exit.
        RunEvent::ExitRequested { api, code, .. } => {
            if code.is_none() && minimize_to_tray_enabled(app_handle) {
                api.prevent_exit();
                log::debug!("[exit] ExitRequested without code — staying in tray");
            }
        }
        #[cfg(target_os = "macos")]
        RunEvent::Reopen {
            has_visible_windows,
            ..
        } => {
            // Dock icon click when no visible windows (Accessory → user reopen).
            if !has_visible_windows {
                show_main_window(app_handle);
            }
        }
        RunEvent::Exit => {
            use crate::engine::cleanup_on_shutdown;
            log::info!("[exit] RunEvent::Exit — final proxy cleanup");
            cleanup_on_shutdown();
            crate::app::single_instance::cleanup();
        }
        _ => {
            #[cfg(not(target_os = "macos"))]
            let _ = app_handle;
        }
    }
}
