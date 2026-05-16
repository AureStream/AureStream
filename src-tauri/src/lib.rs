mod commands;
mod config;

use commands::builtin_config::build_aurestream_mihomo_config;
use commands::mihomo_kernel::{
    download_geodata, start_mihomo_kernel, stop_mihomo_kernel, MihomoKernelState,
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
use log::info;
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
        log::warn!("进入托盘模式时隐藏窗口失败: {}", e);
    }
    #[cfg(any(target_os = "windows", target_os = "linux"))]
    if let Err(e) = window.set_skip_taskbar(true) {
        log::warn!("进入托盘模式时 set_skip_taskbar(true) 失败: {}", e);
    }
    #[cfg(target_os = "macos")]
    if let Err(e) = window
        .app_handle()
        .set_activation_policy(ActivationPolicy::Accessory)
    {
        log::warn!("进入托盘模式时设置 ActivationPolicy 失败: {}", e);
    }
}

/// 从托盘恢复主界面。
fn show_main_window<R: Runtime>(app: &tauri::AppHandle<R>) {
    #[cfg(target_os = "macos")]
    if let Err(e) = app.set_activation_policy(ActivationPolicy::Regular) {
        log::warn!("显示主窗口时设置 ActivationPolicy 失败: {}", e);
    }
    if let Some(window) = app.get_webview_window("main") {
        #[cfg(any(target_os = "windows", target_os = "linux"))]
        if let Err(e) = window.set_skip_taskbar(false) {
            log::warn!("显示主窗口时 set_skip_taskbar(false) 失败: {}", e);
        }
        if let Err(e) = window.show() {
            log::warn!("显示主窗口失败: {}", e);
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

    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_mihomo::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
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
        .setup(move |app| {
            if let Ok(log_dir) = app.path().app_log_dir() {
                eprintln!("[aurestream] 日志目录: {}", log_dir.display());
            }
            info!("AureStream 启动中...");
            let config_state = AureConfigState::load(app.handle())?;
            app.manage(config_state);
            app.manage(ProxyState::default());
            app.manage(MihomoKernelState::default());
            info!("应用状态初始化完成");

            // 后台异步预下载 GeoIP/GeoSite（不阻塞启动）
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = download_geodata(app_handle).await {
                    log::warn!("GeoData 预下载失败: {}", e);
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
            build_aurestream_mihomo_config,
            start_mihomo_kernel,
            stop_mihomo_kernel,
            download_geodata,
            load_app_settings,
            save_app_settings,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                use commands::mihomo_kernel::{stop_mihomo_sidecar, MihomoKernelState};
                if let Some(mihomo) = app_handle.try_state::<MihomoKernelState>() {
                    let _ = tauri::async_runtime::block_on(stop_mihomo_sidecar(&*mihomo));
                }
            }
        });
}
