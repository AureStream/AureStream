//! AureStream v2 Tauri shell — auth IPC + `auth-changed` event bus.

mod commands;
mod state;

use commands::{
    auth_login, auth_logout, auth_register, auth_restore, auth_verify, spawn_initial_restore,
};
use state::AuthState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let auth_state = AuthState::load(&handle)?;
            spawn_initial_restore(&handle, &auth_state);
            handle.manage(auth_state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            auth_login,
            auth_register,
            auth_verify,
            auth_logout,
            auth_restore,
        ])
        .run(tauri::generate_context!())
        .expect("error while running AureStream");
}
