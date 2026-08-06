//! System tray (Tauri v2).
//!
//! Menu layout:
//! 1. 显示主界面
//! 2. ── separator ──
//! 3. 系统代理 / 虚拟网卡  (mutually exclusive check items)
//! 4. ── separator ──
//! 5. 退出应用
//!
//! Ref: <https://v2.tauri.app/zh-cn/learn/system-tray/>

use std::sync::Mutex;

use serde::Serialize;
use tauri::menu::{CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{App, AppHandle, Emitter, Manager};

use crate::commands::engine::{self, EngineAppState};
use crate::window_util::{hide_main_window, show_main_window};

const APP_ALERT_EVENT: &str = "app-alert";

#[derive(Clone, Serialize)]
struct AppAlertPayload {
    kind: &'static str,
    title: &'static str,
    message: String,
}

fn emit_error_alert(app: &AppHandle, title: &'static str, message: impl Into<String>) {
    let message = message.into();
    log::error!("alert: {title}: {message}");
    let _ = app.emit(
        APP_ALERT_EVENT,
        AppAlertPayload {
            kind: "error",
            title,
            message,
        },
    );
    // Ensure the user can see the webview dialog.
    show_main_window(app);
}

const TRAY_ID: &str = "main-tray";
const ID_SHOW: &str = "tray_show";
const ID_SYSTEM: &str = "tray_mode_system";
const ID_TUN: &str = "tray_mode_tun";
const ID_QUIT: &str = "tray_quit";

/// Which OS capture path the tray presents as active.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum CaptureMode {
    #[default]
    Off,
    SystemProxy,
    /// Elevated TUN (Linux helper ready; Windows/macOS when helpers land).
    Tun,
}

/// Shared tray handle + capture mode for menu rebuilds.
pub struct TrayState {
    pub tray: Mutex<Option<TrayIcon>>,
    pub mode: Mutex<CaptureMode>,
}

impl TrayState {
    pub fn new() -> Self {
        Self {
            tray: Mutex::new(None),
            mode: Mutex::new(CaptureMode::Off),
        }
    }

    pub fn mode(&self) -> CaptureMode {
        self.mode.lock().map(|g| *g).unwrap_or(CaptureMode::Off)
    }

    pub fn set_mode(&self, mode: CaptureMode) {
        if let Ok(mut g) = self.mode.lock() {
            *g = mode;
        }
    }
}

impl Default for TrayState {
    fn default() -> Self {
        Self::new()
    }
}

fn build_menu(app: &AppHandle) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    let mode = app
        .try_state::<TrayState>()
        .map(|s| s.mode())
        .unwrap_or(CaptureMode::Off);

    let system_checked = matches!(mode, CaptureMode::SystemProxy);
    let tun_checked = matches!(mode, CaptureMode::Tun);

    let show = MenuItemBuilder::with_id(ID_SHOW, "显示主界面").build(app)?;
    let sep1 = PredefinedMenuItem::separator(app)?;

    let system = CheckMenuItemBuilder::with_id(ID_SYSTEM, "系统代理")
        .checked(system_checked)
        .build(app)?;
    let tun = CheckMenuItemBuilder::with_id(ID_TUN, "虚拟网卡")
        .checked(tun_checked)
        .enabled(true)
        .build(app)?;

    let sep2 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItemBuilder::with_id(ID_QUIT, "退出应用").build(app)?;

    MenuBuilder::new(app)
        .items(&[&show, &sep1, &system, &tun, &sep2, &quit])
        .build()
}

/// Create tray icon + menu during app setup.
pub fn setup_tray(app: &App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle().clone();

    #[cfg(target_os = "macos")]
    let icon = tauri::image::Image::from_bytes(include_bytes!("../../public/tray.png"))?;
    #[cfg(not(target_os = "macos"))]
    let icon = app
        .default_window_icon()
        .cloned()
        .or_else(|| {
            tauri::image::Image::from_bytes(include_bytes!("../../public/logo.png")).ok()
        })
        .ok_or("no tray icon available")?;

    let menu = build_menu(&handle)?;

    let tray = TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .icon_as_template(cfg!(target_os = "macos"))
        .menu(&menu)
        .tooltip("AureStream")
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            on_menu_event(app, event.id.as_ref());
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            }
            | TrayIconEvent::DoubleClick {
                button: MouseButton::Left,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    if let Some(state) = app.try_state::<TrayState>() {
        if let Ok(mut g) = state.tray.lock() {
            *g = Some(tray);
        }
    }

    log::info!("system tray ready");
    Ok(())
}

fn on_menu_event(app: &AppHandle, id: &str) {
    match id {
        ID_SHOW => show_main_window(app),
        ID_SYSTEM => {
            let handle = app.clone();
            tauri::async_runtime::spawn(async move {
                on_toggle_system_proxy(handle).await;
            });
        }
        ID_TUN => {
            let handle = app.clone();
            tauri::async_runtime::spawn(async move {
                on_toggle_tun(handle).await;
            });
        }
        ID_QUIT => {
            let handle = app.clone();
            tauri::async_runtime::spawn(async move {
                quit_app(handle).await;
            });
        }
        _ => {}
    }
}

async fn on_toggle_system_proxy(app: AppHandle) {
    let Some(engine) = app.try_state::<EngineAppState>() else {
        log::warn!("tray: EngineAppState missing");
        return;
    };
    let Some(tray) = app.try_state::<TrayState>() else {
        return;
    };

    let running = engine.last_payload().state == "running"
        || matches!(
            engine.engine_state_raw(),
            aurestream_engine::EngineState::Running
        );

    // Already on system proxy → stop. If on TUN, switch by stopping then starting system.
    if running && matches!(tray.mode(), CaptureMode::SystemProxy) {
        log::info!("tray: stop system proxy");
        match engine::tray_stop(&app).await {
            Ok(()) => {
                tray.set_mode(CaptureMode::Off);
                refresh_menu(&app);
            }
            Err(e) => {
                emit_error_alert(&app, "断开失败", humanize_tray_error(&e));
            }
        }
        return;
    }

    if running {
        let _ = engine::tray_stop(&app).await;
    }

    log::info!("tray: start system proxy");
    match engine::tray_start_system(&app).await {
        Ok(()) => {
            tray.set_mode(CaptureMode::SystemProxy);
            refresh_menu(&app);
        }
        Err(e) => {
            tray.set_mode(CaptureMode::Off);
            refresh_menu(&app);
            show_main_window(&app);
            if is_pre_start_error(&e) {
                emit_error_alert(&app, "连接失败", humanize_tray_error(&e));
            }
        }
    }
}

async fn on_toggle_tun(app: AppHandle) {
    let Some(engine) = app.try_state::<EngineAppState>() else {
        log::warn!("tray: EngineAppState missing");
        return;
    };
    let Some(tray) = app.try_state::<TrayState>() else {
        return;
    };

    let running = engine.last_payload().state == "running"
        || matches!(
            engine.engine_state_raw(),
            aurestream_engine::EngineState::Running
        );

    if running && matches!(tray.mode(), CaptureMode::Tun) {
        log::info!("tray: stop tun");
        match engine::tray_stop(&app).await {
            Ok(()) => {
                tray.set_mode(CaptureMode::Off);
                refresh_menu(&app);
            }
            Err(e) => {
                emit_error_alert(&app, "断开失败", humanize_tray_error(&e));
            }
        }
        return;
    }

    if running {
        let _ = engine::tray_stop(&app).await;
    }

    log::info!("tray: start tun");
    match engine::tray_start_tun(&app).await {
        Ok(()) => {
            tray.set_mode(CaptureMode::Tun);
            refresh_menu(&app);
        }
        Err(e) => {
            tray.set_mode(CaptureMode::Off);
            refresh_menu(&app);
            show_main_window(&app);
            emit_error_alert(&app, "虚拟网卡", humanize_tray_error(&e));
        }
    }
}

fn is_pre_start_error(err: &str) -> bool {
    let s = err.trim();
    s == "not_authenticated"
        || s == "no_active_subscription"
        || s == "subscription_body_missing"
        || s == "no_nodes"
        || s == "auth_state_missing"
        || s == "subs_state_missing"
        || s == "engine_state_missing"
        || s.starts_with("node_not_found:")
        || s.contains("tun_not_installed")
        || s.contains("虚拟网卡")
}

fn humanize_tray_error(err: &str) -> String {
    let s = err.trim();
    if s == "not_authenticated" {
        return "请先登录后再连接".into();
    }
    if s == "no_active_subscription" {
        return "暂无可用订阅，请先打开应用并同步".into();
    }
    if s == "no_nodes" {
        return "暂无可用节点".into();
    }
    if s.starts_with("node_not_found:") {
        return "节点不存在或已失效，请在应用内重新选择节点".into();
    }
    if s.starts_with("sidecar failed:") {
        return format!("内核启动失败：{}", s.trim_start_matches("sidecar failed:"));
    }
    if s.contains("tun_not_installed")
        || s.contains("虚拟网卡服务尚未安装")
        || s.contains("polkit Helper")
        || s.contains("aurestream-tun-helper")
    {
        return "虚拟网卡组件尚未安装。Linux：deb/rpm 或 install-linux-tun-helper.sh；Windows：带 tun-service 的安装包（首次 UAC）；macOS：需签名安装包并安装特权 Helper（勿仅用 tauri dev）；也可暂时使用系统代理。".into();
    }
    // Strip error code prefixes like `tun_not_installed: ...`
    if let Some((_, msg)) = s.split_once(": ") {
        if !msg.is_empty() {
            return msg.to_string();
        }
    }
    s.to_string()
}

async fn quit_app(app: AppHandle) {
    log::info!("tray: quit requested");
    // Best-effort cleanup so system proxy is not left behind.
    if let Err(e) = engine::tray_stop(&app).await {
        log::warn!("tray: stop on quit: {e}");
    }
    hide_main_window(&app);
    app.exit(0);
}

/// Rebuild menu checkmarks from [`TrayState::mode`].
pub fn refresh_menu(app: &AppHandle) {
    let Some(state) = app.try_state::<TrayState>() else {
        return;
    };
    let Ok(guard) = state.tray.lock() else {
        return;
    };
    let Some(ref tray) = *guard else {
        return;
    };
    if let Ok(menu) = build_menu(app) {
        let _ = tray.set_menu(Some(menu));
    }
    let tip = match state.mode() {
        CaptureMode::Off => "AureStream".to_string(),
        CaptureMode::SystemProxy => "AureStream · 系统代理".to_string(),
        CaptureMode::Tun => "AureStream · 虚拟网卡".to_string(),
    };
    let _ = tray.set_tooltip(Some(tip));
}

/// Sync tray checkmarks when the engine emits a new state (Running / Idle / Failed).
pub fn on_engine_payload(app: &AppHandle, state: &str, capture_mode: &str) {
    let Some(tray) = app.try_state::<TrayState>() else {
        return;
    };
    let next = match state {
        "running" | "starting" => match capture_mode {
            "tun" => CaptureMode::Tun,
            "system" => CaptureMode::SystemProxy,
            _ => {
                // Prefer last tray mode during starting if capture not yet set.
                match tray.mode() {
                    CaptureMode::Tun => CaptureMode::Tun,
                    _ => CaptureMode::SystemProxy,
                }
            }
        },
        _ => CaptureMode::Off,
    };
    tray.set_mode(next);
    refresh_menu(app);
}
