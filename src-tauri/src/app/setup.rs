use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_deep_link::DeepLinkExt;
use url::Url;

use crate::utils::show_dashboard;

fn hide_on_launch_enabled(app_handle: &tauri::AppHandle) -> bool {
    use tauri_plugin_store::StoreExt;
    app_handle
        .store("settings.json")
        .ok()
        .and_then(|store| store.get("hide_on_launch_key").and_then(|v| v.as_bool()))
        .unwrap_or(false)
}

/// 首屏 HTML 加载完成后再显示窗口，避免 WebView 空白闪烁。
pub fn show_main_window_after_page_load(app_handle: &tauri::AppHandle) {
    if hide_on_launch_enabled(app_handle) {
        return;
    }
    let Some(window) = app_handle.get_webview_window("main") else {
        return;
    };
    if window.is_visible().unwrap_or(false) {
        return;
    }
    crate::utils::show_main_window(app_handle);
}

/// App 初始化逻辑，对应 Builder::setup 闭包
pub fn app_setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    app.manage(crate::state::AppData::new());
    app.manage(crate::engine::state_machine::EngineStateCell::new());
    stop_orphan_tun_service_on_startup();

    let log_cleanup_handle = app.handle().clone();
    if let Err(e) = std::thread::Builder::new()
        .name("aurestream-log-cleanup".into())
        .spawn(move || {
            crate::engine::log::cleanup_old_app_logs(&log_cleanup_handle);
        })
    {
        log::warn!("[setup] failed to spawn log cleanup thread: {}", e);
    }

    let db_copy_handle = app.handle().clone();
    if let Err(e) = std::thread::Builder::new()
        .name("aurestream-db-copy".into())
        .spawn(move || {
            if let Err(e) = crate::utils::copy_database_files(&db_copy_handle) {
                log::error!("Failed to copy database files: {}", e);
            }
        })
    {
        log::warn!("[setup] failed to spawn database copy thread: {}", e);
    }

    match crate::utils::copy_config_to_app_dir(app.handle()) {
        Ok(path) => log::info!("Config ready at: {:?}", path),
        Err(e) => log::error!("Failed to copy config: {}", e),
    }

    crate::commands::whitelist::spawn_whitelist_refresh_task(app.handle().clone());

    use tauri_plugin_store::StoreExt;

    let hide_on_launch = if let Ok(store) = app.handle().store("settings.json") {
        store
            .get("hide_on_launch_key")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
    } else {
        false
    };

    if hide_on_launch {
        log::info!("[setup] hide_on_launch is enabled, hiding main window on start");
        let _ = crate::utils::enter_tray_mode(app.handle());
    }

    // On Linux/Windows debug builds, register deep links
    #[cfg(all(debug_assertions, any(target_os = "linux", windows)))]
    {
        app.deep_link().register_all()?;
    }

    register_deep_link(app);

    // Spawn network lifecycle listener on Windows and macOS
    #[cfg(any(target_os = "windows", target_os = "macos"))]
    spawn_lifecycle_listener(app.handle());

    // ── System Tray ──────────────────────────────────────────────────
    let show_item = MenuItemBuilder::with_id("show", "显示窗口").build(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "退出应用").build(app)?;
    let tray_menu = MenuBuilder::new(app)
        .items(&[&show_item, &quit_item])
        .build()?;

    #[cfg(target_os = "macos")]
    let tray_icon = tauri::image::Image::from_bytes(include_bytes!("../../../public/logo.png"))?;
    #[cfg(not(target_os = "macos"))]
    let tray_icon = app.default_window_icon().cloned().unwrap();

    #[allow(unused_mut)]
    let mut tray_builder = TrayIconBuilder::with_id("main-tray")
        .icon(tray_icon)
        .menu(&tray_menu);

    let _tray = tray_builder
        .on_menu_event(|app_handle, event| match event.id.as_ref() {
            "show" => {
                crate::utils::show_main_window(app_handle);
            }
            "quit" => {
                let app_handle = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    crate::commands::shell::quit(app_handle).await;
                });
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| match event {
            TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            }
            | TrayIconEvent::DoubleClick {
                button: MouseButton::Left,
                ..
            } => crate::utils::show_main_window(tray.app_handle()),
            _ => {}
        })
        .build(app)?;

    Ok(())
}

#[cfg(target_os = "windows")]
fn stop_orphan_tun_service_on_startup() {
    use aurestream_plugin_tun::scm::{self, QueriedState};

    match scm::query_state() {
        QueriedState::Running | QueriedState::StartPending => {
            log::warn!(
                "[service] AureStreamTunService was running before engine-state ownership; stopping orphan"
            );
            if let Err(e) = scm::stop_service() {
                log::warn!(
                    "[service] failed to stop orphan AureStreamTunService: {}",
                    e
                );
            }
        }
        _ => {}
    }
}

#[cfg(not(target_os = "windows"))]
fn stop_orphan_tun_service_on_startup() {}

// ── Deep Link ──────────────────────────────────────────────────────

/// 从 `aurestream://config?data=...&apply=1` 中提取参数
fn extract_deep_link_data(url: &Url) -> Option<crate::state::DeepLinkPayload> {
    if url.scheme() != "aurestream" || url.host_str() != Some("config") {
        return None;
    }
    let params: std::collections::HashMap<_, _> = url.query_pairs().collect();
    let data = params.get("data")?.to_string();
    let apply = params.get("apply").map(|v| v == "1").unwrap_or(false);
    Some(crate::state::DeepLinkPayload { data, apply })
}

/// 将 deep link payload 写入 pending state
fn store_pending_deep_link(
    app_data: &crate::state::AppData,
    payload: crate::state::DeepLinkPayload,
) {
    if let Ok(mut pending) = app_data.pending_deep_link.lock() {
        *pending = Some(payload);
    }
}

/// 注册 deep link 回调
fn register_deep_link(app: &tauri::App) {
    let handle = app.handle().clone();
    app.deep_link().on_open_url(move |event| {
        let urls = event.urls();
        log::info!("Received deep link: {:#?}", urls);
        show_dashboard(handle.clone());

        if let Some(payload) = urls.first().and_then(extract_deep_link_data) {
            log::info!(
                "Received config data: {} apply={}",
                payload.data,
                payload.apply
            );
            store_pending_deep_link(&handle.state::<crate::state::AppData>(), payload);
            handle.emit("deep_link_pending", ()).unwrap_or_else(|e| {
                log::error!("Failed to emit deep_link_pending signal: {}", e);
            });
        }
    });
}

// ── Lifecycle ──────────────────────────────────────────────────────

#[cfg(any(target_os = "windows", target_os = "macos"))]
const MIN_OUTAGE: std::time::Duration = std::time::Duration::from_secs(2);
#[cfg(any(target_os = "windows", target_os = "macos"))]
const DEBOUNCE_SECS: u64 = 3;
#[cfg(any(target_os = "windows", target_os = "macos"))]
const WAKE_RESTART_THRESHOLD: std::time::Duration = std::time::Duration::from_secs(30);

/// 调度引擎重启
#[cfg(any(target_os = "windows", target_os = "macos"))]
fn schedule_engine_restart(
    handle: tauri::AppHandle,
    epoch_arc: std::sync::Arc<std::sync::atomic::AtomicU64>,
    ctx: &'static str,
) {
    let current_epoch = epoch_arc.load(std::sync::atomic::Ordering::Relaxed);
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(DEBOUNCE_SECS)).await;
        if epoch_arc.load(std::sync::atomic::Ordering::Relaxed) != current_epoch {
            log::info!("[{ctx}] epoch changed, aborting engine restart");
            return;
        }
        let Some((mode, path)) = crate::core::commands::get_running_config() else {
            return;
        };
        log::info!("[{ctx}] restarting engine (mode: {:?})", mode);
        if let Err(e) = crate::core::commands::stop(handle.clone()).await {
            log::error!("[{ctx}] stop engine failed: {}", e);
        } else if let Err(e) = crate::core::commands::start(handle, path, mode).await {
            log::error!("[{ctx}] restart engine failed: {}", e);
        } else {
            log::info!("[{ctx}] engine restarted");
        }
    });
}

/// 生命周期事件监听
#[cfg(any(target_os = "windows", target_os = "macos"))]
pub(crate) fn spawn_lifecycle_listener(app_handle: &tauri::AppHandle) {
    let handle = app_handle.clone();
    let rx = onebox_lifecycle::Sentinel::start().into_receiver();

    std::thread::Builder::new()
        .name("lifecycle-events".into())
        .spawn(move || {
            let network_restart_epoch = std::sync::Arc::new(std::sync::atomic::AtomicU64::new(0));
            let mut network_down_at: Option<std::time::SystemTime> = None;
            let mut will_sleep_at: Option<std::time::SystemTime> = None;

            while let Some(event) = rx.recv() {
                use onebox_lifecycle::SystemEvent;
                match event {
                    SystemEvent::ShuttingDown(shutdown_handle) => {
                        log::info!("[lifecycle] received ShuttingDown event");
                        crate::engine::cleanup_on_shutdown();
                        shutdown_handle.allow();
                    }
                    SystemEvent::WillPowerOff => {
                        log::info!("[lifecycle] received WillPowerOff event");
                        crate::engine::cleanup_on_shutdown();
                    }
                    SystemEvent::WillSleep => {
                        log::info!("[wake] WillSleep");
                        will_sleep_at = Some(std::time::SystemTime::now());
                    }
                    SystemEvent::DidWake => {
                        let sleep_dur = will_sleep_at
                            .take()
                            .and_then(|t| t.elapsed().ok())
                            .unwrap_or_default();
                        log::info!("[wake] DidWake — slept {:.1}s", sleep_dur.as_secs_f32());

                        use crate::engine::{EngineManager, PlatformEngine};
                        PlatformEngine::on_network_up(&handle);

                        if sleep_dur < WAKE_RESTART_THRESHOLD {
                            log::info!(
                                "[wake] sleep {:.1}s < threshold, skipping restart",
                                sleep_dur.as_secs_f32()
                            );
                            continue;
                        }

                        network_restart_epoch.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                        log::info!(
                            "[wake] sleep {:.1}s — scheduling engine restart in {}s",
                            sleep_dur.as_secs_f32(),
                            DEBOUNCE_SECS
                        );
                        schedule_engine_restart(
                            handle.clone(),
                            std::sync::Arc::clone(&network_restart_epoch),
                            "wake",
                        );
                    }
                    SystemEvent::NetworkDown => {
                        log::info!("[network] NetworkDown — cancelling any pending engine restart");
                        network_restart_epoch.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                        network_down_at = Some(std::time::SystemTime::now());

                        use crate::engine::{EngineManager, PlatformEngine};
                        PlatformEngine::on_network_down(&handle);
                    }
                    SystemEvent::NetworkUp => {
                        log::info!("[network] NetworkUp");
                        use crate::engine::{EngineManager, PlatformEngine};
                        PlatformEngine::on_network_up(&handle);
                        let handle_for_retry = handle.clone();
                        tauri::async_runtime::spawn(async move {
                            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                            PlatformEngine::on_network_up(&handle_for_retry);
                        });
                        let down_at = match network_down_at.take() {
                            Some(t) => t,
                            None => continue,
                        };
                        let outage = down_at.elapsed().unwrap_or_default();
                        if outage < MIN_OUTAGE {
                            log::info!(
                                "[network] outage {:.1}s < threshold, skipping restart",
                                outage.as_secs_f32()
                            );
                            continue;
                        }
                        log::info!(
                            "[network] outage {:.1}s — scheduling engine restart in {}s",
                            outage.as_secs_f32(),
                            DEBOUNCE_SECS
                        );
                        network_restart_epoch.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                        schedule_engine_restart(
                            handle.clone(),
                            std::sync::Arc::clone(&network_restart_epoch),
                            "network",
                        );
                    }
                    _ => {}
                }
            }
        })
        .expect("failed to spawn lifecycle thread");
}
