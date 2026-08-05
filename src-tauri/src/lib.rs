//! AureStream v2 Tauri shell.
//!
//! Event bus placeholder: later tasks will emit `auth-changed`, `subs-updated`,
//! and `engine-state` from here. No business IPC in this scaffold.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running AureStream");
}
