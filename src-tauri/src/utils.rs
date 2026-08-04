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

/// Copies `geoip.dat`/`geosite.dat` (and on Windows `wintun.dll`) next to the
/// `aurestream-core` sidecar. Bundled via the `resources/**/*` glob — see
/// `scripts/download-binaries.ts`.
///
/// Xray-core looks for geo assets in `XRAY_LOCATION_ASSET` if set, else the
/// directory the running executable lives in. Windows TUN also loads
/// `wintun.dll` from that same directory. Copying here means every spawn
/// path (Tauri-direct sidecar AND the privileged-helper/TUN-service spawns,
/// which don't go through Tauri's `.env()`) finds them with no extra env
/// plumbing.
pub fn copy_geo_data_files(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let resource_dir = app.path().resource_dir()?;
    let resources_path = resource_dir.join("resources");
    let sidecar_dir = crate::engine::helper::sidecar_dir()?;

    for name in ["geoip.dat", "geosite.dat"] {
        let src = resources_path.join(name);
        if !src.exists() {
            log::warn!("Geo data file not found in bundle: {:?}", src);
            continue;
        }
        let dest = sidecar_dir.join(name);
        // Re-copy unconditionally (unlike copy_database_files, which skips
        // existing files) — geo data is small, read-only, and should always
        // match the version bundled with the current app build.
        if let Err(e) = fs::copy(&src, &dest) {
            log::error!("Failed to copy {:?} to {:?}: {}", src, dest, e);
        } else {
            log::info!("Copied geo data file to {:?}", dest);
        }
    }

    #[cfg(windows)]
    {
        // Prefer the triple-specific DLL staged by download-binaries; fall
        // back to a plain `wintun.dll` if present (manual drop-in).
        #[cfg(target_arch = "x86_64")]
        const WINTUN_TRIPLE_NAME: &str = "wintun-x86_64-pc-windows-msvc.dll";
        #[cfg(target_arch = "aarch64")]
        const WINTUN_TRIPLE_NAME: &str = "wintun-aarch64-pc-windows-msvc.dll";
        #[cfg(not(any(target_arch = "x86_64", target_arch = "aarch64")))]
        const WINTUN_TRIPLE_NAME: &str = "wintun.dll";

        let candidates = [WINTUN_TRIPLE_NAME, "wintun.dll"];
        let mut copied = false;
        for name in &candidates {
            let src = resources_path.join(name);
            if !src.exists() {
                continue;
            }
            let dest = sidecar_dir.join("wintun.dll");
            match fs::copy(&src, &dest) {
                Ok(_) => {
                    log::info!("Copied {} → {:?}", name, dest);
                    copied = true;
                    break;
                }
                Err(e) => log::error!("Failed to copy {:?} to {:?}: {}", src, dest, e),
            }
        }
        if !copied {
            log::warn!(
                "wintun.dll not found in bundle resources — Windows TUN mode will fail until it is present next to aurestream-core"
            );
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

/// macOS: Accessory hides the Dock icon while the window is in the tray;
/// switch back to Regular before showing the window again.
fn set_macos_activation_policy(app_handle: &AppHandle, window_visible: bool) {
    #[cfg(target_os = "macos")]
    {
        let policy = if window_visible {
            tauri::ActivationPolicy::Regular
        } else {
            tauri::ActivationPolicy::Accessory
        };
        if let Err(e) = app_handle.set_activation_policy(policy) {
            log::warn!("[window] set_activation_policy failed: {e}");
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app_handle, window_visible);
    }
}

/// Read the "minimize to tray on close" preference (default: true).
pub fn minimize_to_tray_enabled(app_handle: &AppHandle) -> bool {
    use tauri_plugin_store::StoreExt;
    app_handle
        .store("settings.json")
        .ok()
        .and_then(|store| store.get("minimize_to_tray_key"))
        .and_then(|v| v.as_bool())
        .unwrap_or(true)
}

/// Show + focus the main window (tray click / "显示主窗口" / deep link / reopen).
///
/// Per Tauri v2 tray pattern: `unminimize` → `show` → `set_focus`.
pub fn show_main_window(app_handle: &AppHandle) {
    set_macos_activation_policy(app_handle, true);

    let Some(window) = app_handle.get_webview_window("main") else {
        log::warn!("[window] main window missing while showing");
        return;
    };

    if let Err(e) = window.unminimize() {
        log::debug!("[window] unminimize: {e}");
    }
    if let Err(e) = window.show() {
        log::error!("[window] show failed: {e}");
        return;
    }
    if let Err(e) = window.set_focus() {
        log::warn!("[window] set_focus failed: {e}");
    }
}

/// Hide the main window without destroying it (close → tray / hide-on-launch).
///
/// Per Tauri v2 tray pattern: `window.hide()` only — do **not** minimize to
/// the taskbar and do **not** destroy the webview.
pub fn hide_main_window(app_handle: &AppHandle) {
    let Some(window) = app_handle.get_webview_window("main") else {
        log::warn!("[window] main window missing while hiding");
        set_macos_activation_policy(app_handle, false);
        return;
    };

    if let Err(e) = window.hide() {
        log::error!("[window] hide failed: {e}");
        return;
    }
    set_macos_activation_policy(app_handle, false);
    log::info!("[window] main window hidden to tray");
}

/// Alias used by setup hide-on-launch.
pub fn enter_tray_mode(app_handle: &AppHandle) {
    hide_main_window(app_handle);
}

pub fn show_dashboard(app: AppHandle) {
    show_main_window(&app);
}
