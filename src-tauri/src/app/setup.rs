use tauri::{App, Manager};
use crate::app::state::AppData;

pub fn app_setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    app.manage(AppData::new());
    app.manage(crate::engine::state_machine::EngineStateCell::new());

    crate::core::cleanup_old_app_logs(app.handle());

    if let Err(e) = crate::utils::copy_database_files(app.handle()) {
        log::error!("Failed to copy database files: {}", e);
    }

    match crate::utils::copy_config_to_app_dir(app.handle()) {
        Ok(path) => log::info!("Config ready at: {:?}", path),
        Err(e) => log::error!("Failed to copy config: {}", e),
    }

    crate::commands::whitelist::spawn_whitelist_refresh_task(app.handle().clone());

    Ok(())
}
