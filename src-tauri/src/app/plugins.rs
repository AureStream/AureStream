use tauri::{Builder, Wry};
use tauri_plugin_sql::Migration;

pub fn register_plugins(builder: Builder<Wry>, migrations: Vec<Migration>) -> Builder<Wry> {
    builder
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_os::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:data.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
}
