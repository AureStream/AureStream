use crate::config::AureConfigState;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
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
pub fn load_app_settings(state: State<AureConfigState>) -> Result<AppSettings, String> {
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
    state: State<AureConfigState>,
    settings: AppSettings,
) -> Result<(), String> {
    state.get_mut_and_save(|cfg| {
        cfg.theme = settings.theme;
        cfg.proxy_bypass_domains = settings.proxy_bypass_domains;
        cfg.auto_start = settings.auto_start;
        cfg.auto_connect = settings.auto_connect;
    })
}

#[allow(dead_code)]
#[tauri::command]
pub fn load_latency_cache(state: State<AureConfigState>) -> Result<HashMap<String, u32>, String> {
    let cfg = state.get();
    Ok(cfg.latency_cache.clone())
}

#[allow(dead_code)]
#[tauri::command]
pub fn save_latency_cache(
    state: State<AureConfigState>,
    cache: HashMap<String, u32>,
) -> Result<(), String> {
    state.get_mut_and_save(|cfg| {
        cfg.latency_cache = cache;
    })
}
