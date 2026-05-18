//! 托盘命令：更新系统托盘菜单。

use crate::models::Node;
use tauri::AppHandle;

#[tauri::command]
pub async fn update_tray_menu(
    app: AppHandle,
    nodes: Vec<Node>,
    is_connected: bool,
) -> Result<(), String> {
    let tray = app
        .tray_by_id("main")
        .ok_or_else(|| "找不到系统托盘".to_string())?;

    let show_i = tauri::menu::MenuItem::with_id(&app, "show", "显示主界面", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let quit_i = tauri::menu::MenuItem::with_id(&app, "quit", "退出应用", true, None::<&str>)
        .map_err(|e| e.to_string())?;

    if is_connected && !nodes.is_empty() {
        let mut items: Vec<Box<dyn tauri::menu::IsMenuItem<_>>> = Vec::new();
        items.push(Box::new(show_i));

        // 节点列表（超过 30 个时分组显示）
        if nodes.len() <= 30 {
            for node in &nodes {
                let item = tauri::menu::MenuItem::with_id(
                    &app,
                    format!("node_{}", node.id),
                    &node.name,
                    true,
                    None::<&str>,
                )
                .map_err(|e| e.to_string())?;
                items.push(Box::new(item));
            }
        } else {
            for chunk in nodes.chunks(30) {
                let chunk_items: Vec<tauri::menu::MenuItem<_>> = chunk
                    .iter()
                    .map(|node| {
                        tauri::menu::MenuItem::with_id(
                            &app,
                            format!("node_{}", node.id),
                            &node.name,
                            true,
                            None::<&str>,
                        )
                        .unwrap()
                    })
                    .collect();
                let chunk_refs: Vec<&dyn tauri::menu::IsMenuItem<_>> =
                    chunk_items.iter().map(|i| i as &dyn tauri::menu::IsMenuItem<_>).collect();
                let label = format!(
                    "{} - {}",
                    chunk.first().map(|n| n.name.as_str()).unwrap_or(""),
                    chunk.last().map(|n| n.name.as_str()).unwrap_or("")
                );
                let submenu =
                    tauri::menu::Submenu::with_items(&app, &label, true, &chunk_refs)
                        .map_err(|e| e.to_string())?;
                items.push(Box::new(submenu));
            }
        }

        items.push(Box::new(quit_i));
        let refs: Vec<&dyn tauri::menu::IsMenuItem<_>> = items.iter().map(|b| b.as_ref()).collect();
        let menu = tauri::menu::Menu::with_items(&app, &refs).map_err(|e| e.to_string())?;
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
