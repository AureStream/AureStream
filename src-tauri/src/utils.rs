use std::fs;
use tauri::{AppHandle, Manager};

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

pub fn show_dashboard(app: AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        #[cfg(any(target_os = "windows", target_os = "linux"))]
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}
