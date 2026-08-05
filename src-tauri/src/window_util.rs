//! Main window show / hide helpers (tray + close-to-tray).

use tauri::{AppHandle, Manager};

/// Show + focus the main window (tray click / “显示主界面”).
///
/// Tauri v2 pattern: `unminimize` → `show` → `set_focus`.
pub fn show_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        log::warn!("main window missing while showing");
        return;
    };
    let _ = window.unminimize();
    if let Err(e) = window.show() {
        log::error!("show main window failed: {e}");
    }
    if let Err(e) = window.set_focus() {
        log::warn!("set_focus failed: {e}");
    }
}

/// Hide main window without destroying it (close → tray).
pub fn hide_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        log::warn!("main window missing while hiding");
        return;
    };
    if let Err(e) = window.hide() {
        log::error!("hide main window failed: {e}");
    } else {
        log::info!("main window hidden to tray");
    }
}
