//! 设置命令：加载/保存应用设置。

use crate::config::AureConfigState;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub theme: String,
    pub proxy_bypass_domains: String,
    pub auto_start: bool,
    pub auto_connect: bool,
}

#[tauri::command]
pub fn load_app_settings(state: State<'_, AureConfigState>) -> Result<AppSettings, String> {
    let cfg = state.get();
    Ok(AppSettings {
        theme: cfg.theme.clone(),
        proxy_bypass_domains: cfg.proxy_bypass_domains.clone(),
        auto_start: cfg.auto_start,
        auto_connect: cfg.auto_connect,
    })
}

#[tauri::command]
pub fn save_app_settings(
    state: State<'_, AureConfigState>,
    settings: AppSettings,
) -> Result<(), String> {
    state.get_mut_and_save(|cfg| {
        cfg.theme = settings.theme;
        cfg.proxy_bypass_domains = settings.proxy_bypass_domains;
        cfg.auto_start = settings.auto_start;
        cfg.auto_connect = settings.auto_connect;
    })
}
