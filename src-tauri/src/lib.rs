mod app;
mod commands;
mod core;
pub mod engine;
mod utils;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = app::database::get_migrations();
    let builder = tauri::Builder::default();

    app::plugins::register_plugins(builder, migrations)
        .invoke_handler(tauri::generate_handler![
            // core engine commands
            core::start,
            core::stop,
            core::is_running,
            core::get_engine_state,
            core::clear_engine_error,
            core::reload_config,
            // engine probe commands
            engine::engine_ensure_installed,
            engine::engine_probe,
            // shell commands
            commands::shell::version,
            commands::shell::read_logs,
            commands::shell::open_devtools,
            commands::shell::get_app_version,
            commands::shell::get_app_paths,
            commands::shell::open_directory,
            commands::shell::quit,
            commands::shell::get_pending_deep_link,
            // network commands
            commands::network::get_lan_ip,
            commands::network::ping_google,
            commands::network::open_browser,
            commands::network::check_captive_portal_status,
            commands::network::get_captive_redirect_url,
            commands::network::ping_tcp,
            // prestart commands
            commands::prestart::prestart_check,
            commands::prestart::kill_orphans,
            // dns and config fetch commands
            commands::dns::get_optimal_local_dns_server,
            commands::config_fetch::fetch_config_with_optimal_dns,
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
