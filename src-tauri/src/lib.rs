pub mod adapter;
mod bootstrap;
mod commands;
mod config;
pub mod error;
pub mod ipc;
pub mod models;
mod network;
pub mod runtime;
pub mod subscription;
pub mod storage;

use std::sync::Arc;

use commands::builtin_config::build_runtime_config;
use commands::mihomo_kernel::{start_runtime_engine, stop_runtime_engine};
use models::proxy_config::ProxyState;
use ipc::connection::{
    get_proxy_config, get_proxy_status, set_current_node, start_proxy, stop_proxy,
    update_proxy_config,
};
use ipc::node::{get_nodes, get_nodes_by_provider, test_all_nodes_latency, test_node_latency};
use ipc::settings::{load_app_settings, save_app_settings};
use ipc::subscription::{
    add_provider, delete_provider, delete_subscription_file, download_subscription,
    get_providers, get_subscription_path, update_provider,
};
use ipc::tray::update_tray_menu;
use config::AureConfigState;
use storage::database;
#[cfg(target_os = "macos")]
use tauri::ActivationPolicy;
use tauri::{AppHandle, Emitter, Manager, Runtime, Window};

/// 隐藏主窗口进入托盘模式（不退出进程）。macOS 使用 `Accessory` 激活策略。
fn enter_tray_mode<R: Runtime>(window: &Window<R>) {
    if let Err(e) = window.hide() {
        tracing::warn!(error = %e, "进入托盘模式时隐藏窗口失败");
    }
    #[cfg(any(target_os = "windows", target_os = "linux"))]
    if let Err(e) = window.set_skip_taskbar(true) {
        tracing::warn!(error = %e, "进入托盘模式时 set_skip_taskbar(true) 失败");
    }
    #[cfg(target_os = "macos")]
    if let Err(e) = window
        .app_handle()
        .set_activation_policy(ActivationPolicy::Accessory)
    {
        tracing::warn!(error = %e, "进入托盘模式时设置 ActivationPolicy 失败");
    }
}

/// 从托盘恢复主界面。
fn show_main_window<R: Runtime>(app: &tauri::AppHandle<R>) {
    #[cfg(target_os = "macos")]
    if let Err(e) = app.set_activation_policy(ActivationPolicy::Regular) {
        tracing::warn!(error = %e, "显示主窗口时设置 ActivationPolicy 失败");
    }
    if let Some(window) = app.get_webview_window("main") {
        #[cfg(any(target_os = "windows", target_os = "linux"))]
        if let Err(e) = window.set_skip_taskbar(false) {
            tracing::warn!(error = %e, "显示主窗口时 set_skip_taskbar(false) 失败");
        }
        if let Err(e) = window.show() {
            tracing::warn!(error = %e, "显示主窗口失败");
        }
        let _ = window.set_focus();
    }
}

/// `tauri-plugin-mihomo` 内用 reqwest 访问 `127.0.0.1:9090`；若进程继承系统代理（指向本机 mixed-port），
/// 这些请求会错误走代理，导致 `/proxies`、组延迟测试等全部失败。在创建插件/任意 HTTP 客户端之前写入 NO_PROXY。
fn ensure_loopback_in_no_proxy_env() {
    let loopback = "127.0.0.1,localhost,::1";

    for key in ["NO_PROXY", "no_proxy"] {
        let Ok(cur) = std::env::var(key) else {
            std::env::set_var(key, loopback);
            continue;
        };

        let cur = cur.trim();
        if cur.is_empty() {
            std::env::set_var(key, loopback);
            continue;
        }
        if cur == "*" {
            continue;
        }
        let has_loopback = cur.split(',').any(|p| {
            let p = p.trim();
            p == "127.0.0.1" || p == "localhost" || p == "::1"
        });
        if has_loopback {
            continue;
        }
        std::env::set_var(key, format!("{loopback},{cur}"));
    }
}

/// 初始化数据库连接池、加载配置、执行 YAML→SQLite 迁移。
fn init_storage(app: &AppHandle) -> Result<(sqlx::SqlitePool, AureConfigState), String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法解析应用数据目录: {e}"))?;
    std::fs::create_dir_all(&app_dir).map_err(|e| format!("创建应用数据目录失败: {e}"))?;
    let db_path = app_dir.join("aurestream.db");
    let pool = tauri::async_runtime::block_on(database::connect_pool(&db_path))
        .map_err(|e| format!("数据库初始化失败: {e}"))?;

    let config_state = AureConfigState::load(app)?;
    let cfg_snapshot = { config_state.get().clone() };
    tauri::async_runtime::block_on(bootstrap::migrate_aure_yaml_to_sqlite(
        &pool,
        &cfg_snapshot,
    ))
    .map_err(|e| format!("SQLite 引导迁移失败: {e}"))?;

    Ok((pool, config_state))
}

/// 初始化运行时目录与内核适配器。
fn init_runtime(app: &AppHandle, pool: sqlx::SqlitePool) -> Result<runtime::RuntimeManager, String> {
    let local_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("无法解析本地数据目录: {e}"))?;
    std::fs::create_dir_all(&local_dir).map_err(|e| format!("创建本地数据目录失败: {e}"))?;
    let mihomo_work = local_dir.join(adapter::mihomo::constants::MIHOMO_WORK_DIR);
    let _ = std::fs::create_dir_all(&mihomo_work);

    let (core, mihomo): (Arc<dyn adapter::CoreAdapter>, Option<Arc<adapter::MihomoAdapter>>) =
        match adapter::MihomoAdapter::new(mihomo_work) {
            Ok(a) => {
                let arc = Arc::new(a);
                let core: Arc<dyn adapter::CoreAdapter> = arc.clone();
                (core, Some(arc))
            }
            Err(e) => {
                tracing::warn!(error = %e, "MihomoAdapter 初始化失败，使用 NoopCoreAdapter");
                (Arc::new(adapter::NoopCoreAdapter), None)
            }
        };
    Ok(runtime::RuntimeManager::new(pool, core, mihomo))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    ensure_loopback_in_no_proxy_env();

    // 必须先注册 log 插件：其它插件若抢先初始化全局 logger，会导致
    // PluginInitialization("log", "attempted to set a logger after...") panic。
    // 勿在 Builder 之前手动 tracing_subscriber::init / try_init。

    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    // 应用日志写入文件（排除 mihomo 标签的输出）
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("aurestream".to_string()),
                    })
                    .filter(|metadata| metadata.target() != "mihomo"),
                    // 控制台输出（dev 模式可见，排除 mihomo）
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout)
                        .filter(|metadata| metadata.target() != "mihomo" && !metadata.target().starts_with("sqlx")),
                ])
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepAll)
                .max_file_size(5_000_000)
                .level(log::LevelFilter::Debug)
                .build(),
        )
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_mihomo::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(move |app| {
            if let Ok(log_dir) = app.path().app_log_dir() {
                tracing::info!("日志目录: {}", log_dir.display());
            }
            tracing::info!("AureStream 启动中...");

            let (pool, config_state) = init_storage(app.handle())?;
            let rt = init_runtime(app.handle(), pool)?;
            app.manage(rt);
            app.manage(config_state);
            app.manage(ProxyState::default());
            tracing::info!("应用状态初始化完成");

            // 托盘菜单
            let show_i =
                tauri::menu::MenuItem::with_id(app, "show", "显示主界面", true, None::<&str>)?;
            let switch_i = tauri::menu::Submenu::with_items(
                app,
                "切换节点",
                true,
                &[] as &[&dyn tauri::menu::IsMenuItem<_>],
            )?;
            let quit_i =
                tauri::menu::MenuItem::with_id(app, "quit", "退出应用", true, None::<&str>)?;
            let menu = tauri::menu::Menu::with_items(app, &[&show_i, &switch_i, &quit_i])?;

            tauri::tray::TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main_window(&app),
                    "quit" => app.exit(0),
                    id if id.starts_with("node_") => {
                        let _ = app.emit("tray-select-node", &id[5..]);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                enter_tray_mode(window);
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            start_proxy,
            stop_proxy,
            get_proxy_status,
            set_current_node,
            update_proxy_config,
            get_proxy_config,
            update_tray_menu,
            add_provider,
            update_provider,
            delete_provider,
            get_providers,
            get_nodes,
            get_nodes_by_provider,
            test_node_latency,
            test_all_nodes_latency,
            download_subscription,
            get_subscription_path,
            delete_subscription_file,
            build_runtime_config,
            start_runtime_engine,
            stop_runtime_engine,
            load_app_settings,
            save_app_settings,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(rt) = app_handle.try_state::<runtime::RuntimeManager>() {
                    let _ = tauri::async_runtime::block_on(rt.stop_sidecar());
                }
            }
        });
}
