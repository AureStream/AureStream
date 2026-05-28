mod app;
pub mod engine;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = app::database::get_migrations();
    let builder = tauri::Builder::default();

    app::plugins::register_plugins(builder, migrations)
        .invoke_handler(tauri::generate_handler![greet])
        .setup(app::setup::app_setup)
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

