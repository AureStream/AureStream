use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[allow(dead_code)]
pub fn purge_legacy_cache_files(app: &AppHandle) {
    let Ok(config_dir) = app.path().app_config_dir() else {
        return;
    };
    let legacy_names = ["data.db", "data.db-wal", "data.db-shm"];
    for name in &legacy_names {
        let path = config_dir.join(name);
        if path.exists() {
            if let Err(e) = fs::remove_file(&path) {
                log::warn!("Failed to remove legacy cache file {:?}: {}", path, e);
            } else {
                log::info!("Removed legacy cache file: {:?}", path);
            }
        }
    }
}

pub fn copy_database_files(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let resource_dir = app.path().resource_dir()?;
    let resources_path = resource_dir.join("resources");
    let config_dir = app.path().app_config_dir()?;

    fs::create_dir_all(&config_dir)?;

    log::info!(
        "Copying database files from {:?} to {:?}",
        resources_path,
        config_dir
    );

    if !resources_path.exists() {
        log::warn!("Resources directory does not exist: {:?}", resources_path);
        return Ok(());
    }

    for entry in fs::read_dir(&resources_path)? {
        let entry = entry?;
        let path = entry.path();

        if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("db") {
            let file_name = path.file_name().ok_or("Failed to get file name")?;
            let dest_path = config_dir.join(file_name);

            if !dest_path.exists() {
                log::info!("Copying {:?} to {:?}", path, dest_path);
                fs::copy(&path, &dest_path)?;
            } else {
                log::info!("Database file already exists, skipping: {:?}", dest_path);
            }
        }
    }

    Ok(())
}

pub fn copy_config_to_app_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to get config dir: {}", e))?;
    fs::create_dir_all(&config_dir).map_err(|e| format!("Failed to create config dir: {}", e))?;

    let dest = config_dir.join("config.json");
    if dest.exists() {
        return Ok(dest);
    }

    // CARGO_MANIFEST_DIR = src-tauri/ at compile time
    let crate_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let project_root_config = crate_dir.parent().map(|p| p.join("config.json"));

    // In production, config.json is bundled as a resource
    let resource_config = app
        .path()
        .resource_dir()
        .ok()
        .map(|d| d.join("resources").join("config.json"));

    let candidates = [resource_config, project_root_config];
    let source = candidates.iter().flatten().find(|p| p.exists());

    let Some(source) = source else {
        log::warn!("No config.json found to copy to app config dir");
        return Ok(dest);
    };

    log::info!("Copying config from {:?} to {:?}", source, dest);
    fs::copy(&source, &dest).map_err(|e| format!("Failed to copy config: {}", e))?;
    Ok(dest)
}

/// macOS：Accessory 会隐藏窗口且无 Dock；显示窗口时需切回 Regular。
pub fn set_macos_activation_for_window(app_handle: &AppHandle, visible: bool) {
    #[cfg(target_os = "macos")]
    {
        let policy = if visible {
            tauri::ActivationPolicy::Regular
        } else {
            tauri::ActivationPolicy::Accessory
        };
        let _ = app_handle.set_activation_policy(policy);
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app_handle, visible);
    }
}

pub fn show_main_window(app_handle: &AppHandle) {
    set_macos_activation_for_window(app_handle, true);

    let Some(w) = app_handle.get_webview_window("main") else {
        log::warn!("Main window not found while trying to show it");
        return;
    };

    #[cfg(target_os = "linux")]
    if let Err(e) = w.unminimize() {
        log::warn!("Failed to unminimize main window: {}", e);
    }

    if let Err(e) = w.show() {
        log::error!("Failed to show main window: {}", e);
        return;
    }

    if let Err(e) = w.set_focus() {
        log::warn!("Failed to focus main window: {}", e);
    }
}

fn hide_window_to_tray(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    #[cfg(target_os = "linux")]
    let result = window.minimize();

    #[cfg(not(target_os = "linux"))]
    let result = window.hide().or_else(|hide_error| {
        log::warn!(
            "Failed to hide main window, falling back to minimize: {}",
            hide_error
        );
        window.minimize()
    });

    if result.is_ok() {
        set_macos_activation_for_window(window.app_handle(), false);
    }

    result
}

pub fn hide_main_window_to_tray(window: &tauri::Window) -> tauri::Result<()> {
    let app_handle = window.app_handle();
    let label = window.label().to_string();
    let Some(webview_window) = app_handle.get_webview_window(&label) else {
        set_macos_activation_for_window(app_handle, false);
        return Ok(());
    };
    hide_window_to_tray(&webview_window)
}

pub fn enter_tray_mode(app_handle: &AppHandle) -> tauri::Result<()> {
    let Some(window) = app_handle.get_webview_window("main") else {
        set_macos_activation_for_window(app_handle, false);
        return Ok(());
    };
    hide_window_to_tray(&window)
}

#[allow(dead_code)]
pub fn show_dashboard(app: AppHandle) {
    show_main_window(&app);
}
