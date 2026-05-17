pub mod adapter;
mod bootstrap;
mod commands;
mod config;
pub mod error;
pub mod ipc;
pub mod models;
pub mod network;
pub mod runtime;
pub mod subscription;
pub mod storage;

use std::sync::Arc;

use commands::builtin_config::build_runtime_config;
use commands::mihomo_kernel::{
    prefetch_rule_assets, start_runtime_engine, stop_runtime_engine,
};
use commands::provider::{
    add_provider, delete_provider, get_nodes, get_nodes_by_provider, get_providers,
    test_all_nodes_latency, test_node_latency, update_provider,
};
use commands::proxy::{
    get_proxy_config, get_proxy_status, set_current_node, start_proxy, stop_proxy,
    update_proxy_config, update_tray_menu, ProxyState,
};
use commands::settings::{load_app_settings, save_app_settings};
use commands::subscription::{
    delete_subscription_file, download_subscription, get_subscription_path,
};
use config::AureConfigState;
#[cfg(target_os = "macos")]
use tauri::ActivationPolicy;
use tauri::{Emitter, Manager, Runtime, Window};

/// 关主窗口进入托盘（不退出进程）。平台约定见 `docs/PLATFORM_TRAY_MODE.md`。
///
/// | 平台 | 行为 |
/// | --- | --- |
/// | Windows / Linux | Tauri 文档：`CloseRequested` + `prevent_close` + [`Window::hide`]；任务栏见窗口配置 [`skipTaskbar`] / 运行时 [`Window::set_skip_taskbar`] |
/// | macOS | [`AppHandle::set_activation_policy`]（`Accessory`），与官方文档示例一致 |
///
/// [`Window::hide`]: https://docs.rs/tauri/latest/tauri/window/struct.Window.html#method.hide
/// [`skipTaskbar`]: https://v2.tauri.app/reference/config/#windowconfig
/// [`Window::set_skip_taskbar`]: https://docs.rs/tauri/latest/tauri/window/struct.Window.html#method.set_skip_taskbar
/// [`AppHandle::set_activation_policy`]: https://docs.rs/tauri/latest/tauri/struct.AppHandle.html#method.set_activation_policy
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
                        .filter(|metadata| metadata.target() != "mihomo"),
                ])
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepAll)
                .max_file_size(5_000_000)
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_mihomo::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(move |app| {
            if let Ok(log_dir) = app.path().app_log_dir() {
                eprintln!("[aurestream] 日志目录: {}", log_dir.display());
            }
            tracing::info!("AureStream 启动中...");
            let app_dir = app.path().app_data_dir().map_err(|e| {
                format!("无法解析应用数据目录: {e}")
            })?;
            std::fs::create_dir_all(&app_dir).map_err(|e| format!("创建应用数据目录失败: {e}"))?;
            let db_path = app_dir.join("aurestream.db");
            let pool = tauri::async_runtime::block_on(storage::database::connect_pool(&db_path))
                .map_err(|e| format!("数据库初始化失败: {e}"))?;

            let config_state = AureConfigState::load(app.handle())?;
            let cfg_snapshot = {
                let cfg = config_state.get();
                cfg.clone()
            };
            tauri::async_runtime::block_on(bootstrap::migrate_aure_yaml_to_sqlite(
                &pool,
                &cfg_snapshot,
            ))
            .map_err(|e| format!("SQLite 引导迁移失败: {e}"))?;

            let local_dir = app.path().app_local_data_dir().map_err(|e| {
                format!("无法解析本地数据目录: {e}")
            })?;
            std::fs::create_dir_all(&local_dir)
                .map_err(|e| format!("创建本地数据目录失败: {e}"))?;
            let mihomo_work = local_dir.join("mihomo-work");
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
            app.manage(runtime::RuntimeManager::new(pool, core, mihomo));

            app.manage(config_state);
            app.manage(ProxyState::default());
            tracing::info!("应用状态初始化完成");

            // 后台异步预下载 GeoIP/GeoSite（不阻塞启动）
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = prefetch_rule_assets(app_handle).await {
                    tracing::warn!(error = %e, "规则路由资源预下载失败");
                }
            });

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
                .on_menu_event(|app, event| {
                    let id = event.id.as_ref();
                    if id == "show" {
                        show_main_window(&app);
                    } else if id == "quit" {
                        app.exit(0);
                    } else if id.starts_with("node_") {
                        let node_id = &id[5..]; // remove "node_"
                        let _ = app.emit("tray-select-node", node_id);
                        if let Some(_window) = app.get_webview_window("main") {
                            // 可选：切换节点后是否显示主界面
                            // let _ = _window.show();
                            // let _ = _window.set_focus();
                        }
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        show_main_window(&app);
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
            prefetch_rule_assets,
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
