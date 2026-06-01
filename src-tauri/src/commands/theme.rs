//! Direct NSWindow.appearance override for macOS.

#[cfg(target_os = "macos")]
unsafe extern "C" {
    fn aurestream_set_window_appearance(ns_window_ptr: *mut std::ffi::c_void, theme: i32);
}

#[tauri::command]
pub fn set_native_window_theme(window: tauri::Window, theme: Option<String>) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let ns_window = window.ns_window().map_err(|e| e.to_string())?;
        let mode: i32 = match theme.as_deref() {
            Some("light") => 1,
            Some("dark") => 2,
            _ => 0, // None or unknown — inherit from OS
        };
        unsafe {
            aurestream_set_window_appearance(ns_window, mode);
        }
        log::debug!(
            "[theme] native set_window_appearance label={} mode={}",
            window.label(),
            mode
        );
    }
    #[cfg(not(target_os = "macos"))]
    {
        // No-op on non-mac hosts
        let _ = (window, theme);
    }
    Ok(())
}
