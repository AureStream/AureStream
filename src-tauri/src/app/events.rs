use tauri::{AppHandle, Manager, RunEvent, Window, WindowEvent};

fn move_window_to_tray(window: &Window) -> tauri::Result<()> {
    crate::utils::hide_main_window_to_tray(window)
}

pub fn on_window_event(window: &Window, event: &WindowEvent) {
    match event {
        WindowEvent::CloseRequested { api, .. } => {
            if window.label() == "main" {
                use tauri_plugin_store::StoreExt;
                let minimize_to_tray = if let Ok(store) = window.app_handle().store("settings.json")
                {
                    store
                        .get("minimize_to_tray_key")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(true)
                } else {
                    true
                };

                if minimize_to_tray {
                    api.prevent_close();
                    match move_window_to_tray(window) {
                        Ok(()) => {
                            log::info!("Window close request redirected to tray");
                        }
                        Err(e) => {
                            log::error!("Failed to redirect close request to tray: {}", e);
                        }
                    }
                } else {
                    // Prevent immediate window destruction and perform a graceful
                    // async shutdown via quit() which does stop → cleanup → exit.
                    // This avoids calling block_on from a sync event handler.
                    api.prevent_close();
                    let handle = window.app_handle().clone();
                    tauri::async_runtime::spawn(async move {
                        crate::commands::shell::quit(handle).await;
                    });
                }
            }
        }
        WindowEvent::Destroyed => {
            if window.label() == "main" {
                log::info!("Main window destroyed");
            }
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
                crate::utils::show_main_window(app_handle);
            }
        }
        RunEvent::Exit => {
            use crate::engine::cleanup_on_shutdown;
            log::info!("[exit] RunEvent::Exit fired, performing final proxy cleanup");
            cleanup_on_shutdown();
            crate::app::single_instance::cleanup();
        }
        _ => {
            #[cfg(not(target_os = "macos"))]
            let _ = app_handle;
        }
    }
}
