//! AureStream v2 Tauri shell — auth + subscriptions + engine event bus.

mod commands;
mod state;

use commands::{
    auth_login, auth_logout, auth_register, auth_restore, auth_verify, spawn_initial_restore,
    engine_get_state, engine_select_node, engine_start, engine_stop, EngineAppState, subs_list,
    subs_sync,
};
use state::{AuthState, SubsState};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let auth_state = AuthState::load(&handle)?;
            let subs_state = SubsState::load(&handle)?;
            let engine_state = EngineAppState::load(&handle)?;
            spawn_initial_restore(&handle, &auth_state);
            handle.manage(auth_state);
            handle.manage(subs_state);
            handle.manage(engine_state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            auth_login,
            auth_register,
            auth_verify,
            auth_logout,
            auth_restore,
            subs_sync,
            subs_list,
            engine_start,
            engine_stop,
            engine_select_node,
            engine_get_state,
        ])
        .run(tauri::generate_context!())
        .expect("error while running AureStream");
}
