//! 托盘命令：更新系统托盘菜单。
//!
//! 菜单固定为 3 项：显示主界面、状态/节点名（Submenu）、退出应用。
//! 节点分组每组最多 10 个，选中节点前显示 ✓。

use crate::models::Node;
use tauri::AppHandle;

const MAX_NAME_LEN: usize = 20;
const GROUP_SIZE: usize = 10;

fn truncate_name(name: &str) -> String {
    if name.chars().count() > MAX_NAME_LEN {
        format!("{}…", &name.chars().take(MAX_NAME_LEN).collect::<String>())
    } else {
        name.to_string()
    }
}

/// 为单个节点创建 MenuItem，选中节点前加 ✓
fn node_menu_item(
    app: &AppHandle,
    node: &Node,
    current_node_id: &Option<String>,
) -> Result<tauri::menu::MenuItem<tauri::Wry>, String> {
    let display_name = if current_node_id.as_deref() == Some(&node.id) {
        format!("✓ {}", node.name)
    } else {
        format!("  {}", node.name)
    };
    tauri::menu::MenuItem::with_id(app, format!("node_{}", node.id), &display_name, true, None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_tray_menu(
    app: AppHandle,
    nodes: Vec<Node>,
    is_connected: bool,
    current_node_id: Option<String>,
) -> Result<(), String> {
    let tray = app
        .tray_by_id("main")
        .ok_or_else(|| "找不到系统托盘".to_string())?;

    let show_i = tauri::menu::MenuItem::with_id(&app, "show", "显示主界面", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let quit_i = tauri::menu::MenuItem::with_id(&app, "quit", "退出应用", true, None::<&str>)
        .map_err(|e| e.to_string())?;

    if is_connected && !nodes.is_empty() {
        let selected_name = current_node_id
            .as_deref()
            .and_then(|id| nodes.iter().find(|n| n.id == id))
            .map(|n| truncate_name(&n.name))
            .unwrap_or_else(|| "节点".to_string());

        let node_submenu = if nodes.len() <= GROUP_SIZE {
            let items: Vec<tauri::menu::MenuItem<_>> = nodes
                .iter()
                .map(|n| node_menu_item(&app, n, &current_node_id))
                .collect::<Result<_, _>>()?;
            let refs: Vec<&dyn tauri::menu::IsMenuItem<_>> =
                items.iter().map(|i| i as &dyn tauri::menu::IsMenuItem<_>).collect();
            tauri::menu::Submenu::with_items(&app, &selected_name, true, &refs)
                .map_err(|e| e.to_string())?
        } else {
            let mut subs: Vec<tauri::menu::Submenu<_>> = Vec::new();
            for (gi, chunk) in nodes.chunks(GROUP_SIZE).enumerate() {
                let first = chunk.first().map(|n| truncate_name(&n.name)).unwrap_or_default();
                let last = chunk.last().map(|n| truncate_name(&n.name)).unwrap_or_default();
                let label = format!("分组 {} ({} - {})", gi + 1, first, last);
                let chunk_items: Vec<tauri::menu::MenuItem<_>> = chunk
                    .iter()
                    .map(|n| node_menu_item(&app, n, &current_node_id))
                    .collect::<Result<_, _>>()?;
                let chunk_refs: Vec<&dyn tauri::menu::IsMenuItem<_>> =
                    chunk_items.iter().map(|i| i as &dyn tauri::menu::IsMenuItem<_>).collect();
                subs.push(
                    tauri::menu::Submenu::with_items(&app, &label, true, &chunk_refs)
                        .map_err(|e| e.to_string())?,
                );
            }
            let sub_refs: Vec<&dyn tauri::menu::IsMenuItem<_>> =
                subs.iter().map(|s| s as &dyn tauri::menu::IsMenuItem<_>).collect();
            tauri::menu::Submenu::with_items(&app, &selected_name, true, &sub_refs)
                .map_err(|e| e.to_string())?
        };

        let menu = tauri::menu::Menu::with_items(
            &app,
            &[
                &show_i as &dyn tauri::menu::IsMenuItem<_>,
                &node_submenu,
                &quit_i,
            ],
        )
        .map_err(|e| e.to_string())?;
        tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    } else {
        let not_connected =
            tauri::menu::MenuItem::with_id(&app, "not_connected", "未连接", false, None::<&str>)
                .map_err(|e| e.to_string())?;
        let menu = tauri::menu::Menu::with_items(&app, &[&show_i, &not_connected, &quit_i])
            .map_err(|e| e.to_string())?;
        tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    }

    Ok(())
}
