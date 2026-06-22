mod app;
mod commands;
mod core;
mod engine;
pub mod state;
mod utils;

use tauri::Manager;

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
            crate::core::commands::start,
            crate::core::commands::stop,
            crate::core::commands::get_engine_state,
            crate::core::commands::clear_engine_error,
            crate::core::commands::reload_config,
            crate::core::commands::switch_proxy_mode,
            crate::engine::config_check::mark_config_verified,
            // engine probe commands
            crate::core::engine_commands::engine_ensure_installed,
            crate::core::engine_commands::engine_uninstall_service,
            crate::core::engine_commands::engine_probe,
            // shell commands
            commands::shell::version,
            commands::shell::read_logs,
            commands::shell::open_devtools,
            commands::shell::get_app_version,
            commands::shell::get_app_paths,
            commands::shell::get_config_json_path,
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
        .on_page_load(|webview, payload| {
            use tauri::webview::PageLoadEvent;
            if webview.label() != "main" {
                return;
            }
            if payload.event() != PageLoadEvent::Finished {
                return;
            }
            app::setup::show_main_window_after_page_load(webview.app_handle());
        })
        .on_window_event(app::events::on_window_event)
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(app::events::on_run_event)
}
