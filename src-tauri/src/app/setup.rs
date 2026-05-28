use tauri::{App, Manager};
use crate::app::state::AppData;

pub fn app_setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    app.manage(AppData::new());
    Ok(())
}
