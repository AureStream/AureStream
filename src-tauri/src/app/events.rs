use tauri::{AppHandle, Manager, RunEvent, Window, WindowEvent};

pub fn on_window_event(window: &Window, event: &WindowEvent) {
    match event {
        WindowEvent::CloseRequested { api, .. } => {
            if window.label() == "main" {
                use tauri_plugin_store::StoreExt;
                let minimize_to_tray = if let Ok(store) = window.app_handle().store("settings.json") {
                    store.get("minimize_to_tray_key")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(true)
                } else {
                    true
                };

                if minimize_to_tray {
                    api.prevent_close();
                    log::info!("Window close request redirected to minimize to tray");
                    if let Some(w) = window.app_handle().get_webview_window("main") {
                        #[cfg(target_os = "linux")]
                        let _ = w.minimize();
                        #[cfg(not(target_os = "linux"))]
                        let _ = w.hide();
                    }
                } else {
                    log::info!("Window close request accepted, exiting application");
                }
            }
        }
        WindowEvent::Destroyed => {
            if window.label() == "main" {
                log::info!("Main window destroyed, application will exit");
                crate::commands::shell::sync_quit(window.app_handle().clone());
            }
            log::info!("Destroyed");
        }
        _ => {}
    }
}

pub fn on_run_event(app_handle: &AppHandle, event: RunEvent) {
    match event {
        #[cfg(target_os = "macos")]
        RunEvent::Reopen {
            has_visible_windows,
            ..
        } => {
            if !has_visible_windows {
                if let Some(w) = app_handle.get_webview_window("main") {
                    w.show().unwrap_or_else(|e| {
                        log::error!("Failed to show main window on reopen: {}", e);
                    });
                    w.set_focus().unwrap_or_else(|e| {
                        log::error!("Failed to focus main window on reopen: {}", e);
                    });
                }
            }
        }
        RunEvent::Exit => {
            use crate::engine::cleanup_on_shutdown;
            log::info!("[exit] RunEvent::Exit fired, performing final proxy cleanup");
            cleanup_on_shutdown();
        }
        _ => {
            #[cfg(not(target_os = "macos"))]
            let _ = app_handle;
        }
    }
}
