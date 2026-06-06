mod app;
mod commands;
mod core;
pub mod engine;
mod utils;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Enforce single instance — second instance exits after focusing existing window
    app::single_instance::ensure_single_instance();

    #[cfg(target_os = "windows")]
    {
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(exe_dir) = exe_path.parent() {
                let portable_marker1 = exe_dir.join("aurestream.portable");
                let portable_marker2 = exe_dir.join("portable");
                if portable_marker1.exists() || portable_marker2.exists() {
                    let portable_data_dir = exe_dir.join("portable-data");
                    let portable_data_str = portable_data_dir.to_string_lossy().into_owned();
                    std::env::set_var("APPDATA", &portable_data_str);
                    std::env::set_var("LOCALAPPDATA", &portable_data_str);
                }
            }
        }
    }

    let migrations = app::database::get_migrations();
    let builder = tauri::Builder::default();

    app::plugins::register_plugins(builder, migrations)
        .invoke_handler(tauri::generate_handler![
            // core engine commands
            core::start,
            core::stop,
            core::get_engine_state,
            core::clear_engine_error,
            core::reload_config,
            // engine probe commands
            engine::engine_ensure_installed,
            engine::engine_uninstall_service,
            engine::engine_probe,
            // shell commands
            commands::shell::version,
            commands::shell::read_logs,
            commands::shell::open_devtools,
            commands::shell::get_app_version,
            commands::shell::get_app_paths,
            commands::shell::open_directory,
            commands::shell::quit,
            commands::shell::restart,
            commands::shell::get_pending_deep_link,
            // network commands
            commands::network::ping_tcp,
            commands::network::get_geoip_info,
            // config fetch commands
            commands::config_fetch::fetch_config,
            commands::config_fetch::verify_deep_link_url,
            // native theme commands
            commands::theme::set_native_window_theme,
        ])
        .setup(app::setup::app_setup)
        .on_window_event(app::events::on_window_event)
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(app::events::on_run_event)
}
