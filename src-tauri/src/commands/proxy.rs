use crate::commands::{allocate_high_random_port, ProxyConfig, ProxyStatus};
use crate::runtime::RuntimeManager;
use std::sync::Mutex;
use tauri::State;

pub struct ProxyState {
    pub config: Mutex<ProxyConfig>,
    pub status: Mutex<ProxyStatus>,
}

impl Default for ProxyState {
    fn default() -> Self {
        Self {
            config: Mutex::new(ProxyConfig::default()),
            status: Mutex::new(ProxyStatus::default()),
        }
    }
}

#[tauri::command]
pub fn start_proxy(state: State<ProxyState>) -> Result<String, String> {
    let mut config = state.config.lock().map_err(|e| e.to_string())?;
    let mut status = state.status.lock().map_err(|e| e.to_string())?;
    config.listen = "127.0.0.1".to_string();
    if config.mixed_port == 0 {
        config.mixed_port = allocate_high_random_port()?;
    }
    status.is_running = true;
    Ok(format!(
        "Proxy prepared on {}:{}",
        config.listen, config.mixed_port
    ))
}

#[tauri::command]
pub async fn stop_proxy(
    rt: State<'_, RuntimeManager>,
    proxy_state: State<'_, ProxyState>,
) -> Result<String, String> {
    rt.stop_sidecar().await?;
    let mut config = proxy_state.config.lock().map_err(|e| e.to_string())?;
    let mut status = proxy_state.status.lock().map_err(|e| e.to_string())?;
    status.is_running = false;
    status.current_node = None;
    config.mixed_port = 0;
    Ok("Proxy stopped successfully".to_string())
}

#[tauri::command]
pub fn get_proxy_status(state: State<ProxyState>) -> Result<ProxyStatus, String> {
    let status = state.status.lock().map_err(|e| e.to_string())?;
    Ok(status.clone())
}

#[tauri::command]
pub fn set_current_node(state: State<ProxyState>, node_name: String) -> Result<(), String> {
    let mut status = state.status.lock().map_err(|e| e.to_string())?;
    status.current_node = Some(node_name);
    Ok(())
}

#[tauri::command]
pub fn update_proxy_config(state: State<ProxyState>, config: ProxyConfig) -> Result<(), String> {
    let mut current_config = state.config.lock().map_err(|e| e.to_string())?;
    *current_config = config;
    Ok(())
}

#[tauri::command]
pub fn get_proxy_config(state: State<ProxyState>) -> Result<ProxyConfig, String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;
    Ok(config.clone())
}

#[tauri::command]
pub fn update_tray_menu(
    app: tauri::AppHandle,
    nodes: Vec<crate::commands::Node>,
    is_connected: bool,
) -> Result<(), String> {
    let tray = app.tray_by_id("main").ok_or("Tray not found")?;

    let show_i = tauri::menu::MenuItem::with_id(&app, "show", "显示主界面", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let quit_i = tauri::menu::MenuItem::with_id(&app, "quit", "退出应用", true, None::<&str>)
        .map_err(|e| e.to_string())?;

    let mut all_items: Vec<tauri::menu::MenuItem<tauri::Wry>> = Vec::new();
    if is_connected {
        for node in &nodes {
            if let Ok(item) = tauri::menu::MenuItem::with_id(
                &app,
                format!("node_{}", node.id),
                node.name.clone(),
                true,
                None::<&str>,
            ) {
                all_items.push(item);
            }
        }
    }

    let mut group_submenus: Vec<tauri::menu::Submenu<tauri::Wry>> = Vec::new();
    let mut refs: Vec<&dyn tauri::menu::IsMenuItem<_>> = Vec::new();

    if is_connected {
        if all_items.len() <= 30 {
            for item in &all_items {
                refs.push(item as &dyn tauri::menu::IsMenuItem<_>);
            }
        } else {
            for (i, chunk) in all_items.chunks(30).enumerate() {
                let start = i * 30 + 1;
                let end = start + chunk.len() - 1;
                let group_name = format!("节点 {} - {}", start, end);

                let mut chunk_refs: Vec<&dyn tauri::menu::IsMenuItem<_>> = Vec::new();
                for item in chunk {
                    chunk_refs.push(item as &dyn tauri::menu::IsMenuItem<_>);
                }

                if let Ok(submenu) =
                    tauri::menu::Submenu::with_items(&app, group_name, true, &chunk_refs)
                {
                    group_submenus.push(submenu);
                }
            }
            for submenu in &group_submenus {
                refs.push(submenu as &dyn tauri::menu::IsMenuItem<_>);
            }
        }
    }

    let switch_title = if is_connected {
        "切换节点"
    } else {
        "尚未连接"
    };
    let switch_i = tauri::menu::Submenu::with_items(&app, switch_title, is_connected, &refs)
        .map_err(|e| e.to_string())?;

    let menu = tauri::menu::Menu::with_items(&app, &[&show_i, &switch_i, &quit_i])
        .map_err(|e| e.to_string())?;
    tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;

    Ok(())
}
