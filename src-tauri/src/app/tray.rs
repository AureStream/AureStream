use tauri::menu::{CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};

use crate::engine::state_machine::EngineState;
use crate::state::AppData;
use crate::utils::show_main_window;

/// 根据引擎状态与当前代理模式构建托盘右键菜单。
fn build_tray_menu(app_handle: &AppHandle) -> Result<tauri::menu::Menu<tauri::Wry>, tauri::Error> {
    let state = app_handle
        .state::<crate::engine::state_machine::EngineStateCell>()
        .snapshot();

    // 读取当前应该选中的代理模式（仅在引擎启动或运行时选中打勾，关闭时不勾选）
    let (is_system_checked, is_tun_checked) = match &state {
        EngineState::Starting { mode, .. } | EngineState::Running { mode, .. } => {
            if mode == "tun" {
                (false, true)
            } else {
                (true, false)
            }
        }
        _ => (false, false),
    };

    let show_item = MenuItemBuilder::with_id("tray_show", "显示主窗口").build(app_handle)?;
    let sep1 = PredefinedMenuItem::separator(app_handle)?;

    // 使用 CheckMenuItemBuilder 构建具有勾选框的菜单项
    let mode_system = CheckMenuItemBuilder::with_id("tray_mode_system", "系统代理")
        .checked(is_system_checked)
        .build(app_handle)?;
    let mode_tun = CheckMenuItemBuilder::with_id("tray_mode_tun", "虚拟网关")
        .checked(is_tun_checked)
        .build(app_handle)?;

    let sep2 = PredefinedMenuItem::separator(app_handle)?;
    let quit_item = MenuItemBuilder::with_id("tray_quit", "退出应用").build(app_handle)?;

    MenuBuilder::new(app_handle)
        .items(&[
            &show_item,
            &sep1,
            &mode_system,
            &mode_tun,
            &sep2,
            &quit_item,
        ])
        .build()
}

/// 初始化系统托盘：创建图标、菜单、事件处理，并将句柄存入 AppData。
pub fn setup_tray(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    #[cfg(target_os = "macos")]
    let tray_icon = tauri::image::Image::from_bytes(include_bytes!("../../../public/logo.png"))?;
    #[cfg(not(target_os = "macos"))]
    let tray_icon = app.default_window_icon().cloned().unwrap_or_else(|| {
        tauri::image::Image::from_bytes(include_bytes!("../../../public/logo.png")).unwrap()
    });

    let menu = build_tray_menu(app.handle())?;

    let tray = TrayIconBuilder::with_id("main-tray")
        .icon(tray_icon)
        .menu(&menu)
        .tooltip("AureStream")
        .on_menu_event(|app_handle, event| match event.id.as_ref() {
            "tray_show" => show_main_window(app_handle),
            "tray_mode_system" => {
                use tauri::Emitter;
                let _ = app_handle.emit("tray-switch-mode", "system");
                update_tray_menu(app_handle);
            }
            "tray_mode_tun" => {
                use tauri::Emitter;
                let _ = app_handle.emit("tray-switch-mode", "tun");
                update_tray_menu(app_handle);
            }
            "tray_quit" => {
                let handle = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    crate::commands::shell::quit(handle).await;
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
            } => show_main_window(tray.app_handle()),
            _ => {}
        })
        .build(app)?;

    // 存储句柄供后续更新
    if let Ok(mut handle) = app.state::<AppData>().tray_handle.lock() {
        *handle = Some(tray);
    }

    Ok(())
}

/// 引擎状态变更后调用，刷新菜单以更新选中标识和 tooltip。
pub fn update_tray_menu(app_handle: &AppHandle) {
    if let Ok(guard) = app_handle.state::<AppData>().tray_handle.lock() {
        if let Some(ref tray) = *guard {
            if let Ok(menu) = build_tray_menu(app_handle) {
                let _ = tray.set_menu(Some(menu));
            }
            let state = app_handle
                .state::<crate::engine::state_machine::EngineStateCell>()
                .snapshot();
            let _ = tray.set_tooltip(Some(&format!("AureStream - {}", state.status_text())));
        }
    }
}

impl EngineState {
    /// 用于 tooltip 的简短状态文本
    pub fn status_text(&self) -> &'static str {
        match self {
            EngineState::Idle { .. } => "空闲",
            EngineState::Starting { .. } => "启动中",
            EngineState::Running { .. } => "运行中",
            EngineState::Stopping { .. } => "停止中",
            EngineState::Failed { .. } => "已失败",
        }
    }
}
