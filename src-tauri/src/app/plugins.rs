use log::LevelFilter;
use tauri::{Builder, Wry};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};
use tauri_plugin_sql::Migration;

const APP_LOG_MAX_FILE_SIZE: u128 = 50 * 1024 * 1024;

#[allow(unused_variables)]
pub fn register_plugins(builder: Builder<Wry>, migrations: Vec<Migration>) -> Builder<Wry> {
    let builder = builder
        .plugin({
            let targets = ["aurestream_lib"];
            tauri_plugin_log::Builder::new()
                .filter(move |metadata| {
                    targets
                        .iter()
                        .any(|&target| metadata.target().starts_with(target))
                })
                .level(LevelFilter::Info)
                .timezone_strategy(TimezoneStrategy::UseLocal)
                .max_file_size(APP_LOG_MAX_FILE_SIZE)
                .rotation_strategy(RotationStrategy::KeepAll)
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir { file_name: None }),
                ])
                .build()
        })
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:data.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--silently"]),
        ));

    // Updater plugin — desktop only (Android/iOS use their native stores)
    #[cfg(desktop)]
    {
        builder.plugin(tauri_plugin_updater::Builder::new().build())
    }
    #[cfg(not(desktop))]
    builder
}
