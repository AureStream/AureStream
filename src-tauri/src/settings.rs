//! Application settings persistence, autostart synchronization, and IPC.
//!
//! Follows `docs/persist-compat.md`:
//! - Atomic write via `persist::write_json`
//! - Resilient read via `persist::read_json_opt`
//! - All fields optional with `#[serde(default)]`

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_autostart::ManagerExt;

use crate::persist::{read_json_opt, write_json};

pub const APP_SETTINGS_FILE: &str = "app-settings.json";
pub const APP_SETTINGS_CHANGED_EVENT: &str = "app-settings-changed";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AutoConnectMode {
    #[default]
    Last,
    System,
    Tun,
}

#[allow(dead_code)]
impl AutoConnectMode {
    pub fn as_str(&self) -> &'static str {
        match self {
            AutoConnectMode::Last => "last",
            AutoConnectMode::System => "system",
            AutoConnectMode::Tun => "tun",
        }
    }

    pub fn parse(s: &str) -> Self {
        match s.trim().to_ascii_lowercase().as_str() {
            "system" | "systemproxy" => AutoConnectMode::System,
            "tun" | "virtual" => AutoConnectMode::Tun,
            _ => AutoConnectMode::Last,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    #[serde(default = "default_schema_version")]
    pub schema_version: u32,
    #[serde(default)]
    pub autostart: bool,
    #[serde(default)]
    pub silent_start: bool,
    #[serde(default)]
    pub auto_connect: bool,
    #[serde(default)]
    pub auto_connect_mode: AutoConnectMode,
    #[serde(default)]
    pub last_capture_mode: Option<String>,
}

fn default_schema_version() -> u32 {
    1
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            schema_version: 1,
            autostart: false,
            silent_start: false,
            auto_connect: false,
            auto_connect_mode: AutoConnectMode::Last,
            last_capture_mode: None,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettingsUpdate {
    pub autostart: Option<bool>,
    pub silent_start: Option<bool>,
    pub auto_connect: Option<bool>,
    pub auto_connect_mode: Option<AutoConnectMode>,
}

pub struct SettingsState {
    pub inner: Mutex<AppSettings>,
    path: PathBuf,
}

impl SettingsState {
    pub fn load(handle: &AppHandle) -> Result<Self, String> {
        let dir = handle
            .path()
            .app_data_dir()
            .map_err(|e| format!("app data dir: {e}"))?;
        fs::create_dir_all(&dir).map_err(|e| format!("create app data dir: {e}"))?;
        let path = dir.join(APP_SETTINGS_FILE);

        let initial: AppSettings = read_json_opt(&path)?.unwrap_or_default();

        Ok(Self {
            inner: Mutex::new(initial),
            path,
        })
    }

    pub fn get(&self) -> AppSettings {
        self.inner
            .lock()
            .map(|g| g.clone())
            .unwrap_or_default()
    }

    pub fn save(&self, settings: &AppSettings) -> Result<(), String> {
        write_json(&self.path, settings)?;
        if let Ok(mut g) = self.inner.lock() {
            *g = settings.clone();
        }
        Ok(())
    }

    pub fn sync_os_autostart(&self, os_enabled: bool) -> Result<(), String> {
        let mut current = self.get();
        if current.autostart != os_enabled {
            log::info!(
                "synchronizing autostart state: config={} os={}",
                current.autostart,
                os_enabled
            );
            current.autostart = os_enabled;
            self.save(&current)?;
        }
        Ok(())
    }

    pub fn record_last_capture_mode(&self, mode: &str) -> Result<(), String> {
        let mut current = self.get();
        if current.last_capture_mode.as_deref() != Some(mode) {
            current.last_capture_mode = Some(mode.to_string());
            self.save(&current)?;
        }
        Ok(())
    }
}

/// Query current application settings.
#[tauri::command]
pub fn settings_get(state: State<'_, SettingsState>) -> Result<AppSettings, String> {
    Ok(state.get())
}

/// Update application settings, applying OS autostart and refreshing tray if changed.
#[tauri::command]
pub async fn settings_set(
    app: AppHandle,
    state: State<'_, SettingsState>,
    update: AppSettingsUpdate,
) -> Result<AppSettings, String> {
    let mut current = state.get();

    if let Some(enabled) = update.autostart {
        if enabled != current.autostart {
            let autolaunch = app.autolaunch();
            if enabled {
                log::info!("enabling system autostart");
                autolaunch
                    .enable()
                    .map_err(|e| format!("enable autostart: {e}"))?;
            } else {
                log::info!("disabling system autostart");
                autolaunch
                    .disable()
                    .map_err(|e| format!("disable autostart: {e}"))?;
            }
            current.autostart = enabled;
        }
    }

    if let Some(silent) = update.silent_start {
        current.silent_start = silent;
    }

    if let Some(auto_conn) = update.auto_connect {
        current.auto_connect = auto_conn;
    }

    if let Some(mode) = update.auto_connect_mode {
        current.auto_connect_mode = mode;
    }

    state.save(&current)?;

    // Refresh tray menu checkmarks and inform listeners
    crate::tray::refresh_menu(&app);
    let _ = app.emit(APP_SETTINGS_CHANGED_EVENT, &current);

    Ok(current)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_settings_conform_to_contract() {
        let s = AppSettings::default();
        assert_eq!(s.schema_version, 1);
        assert!(!s.autostart);
        assert!(!s.silent_start);
        assert!(!s.auto_connect);
        assert_eq!(s.auto_connect_mode, AutoConnectMode::Last);
        assert!(s.last_capture_mode.is_none());
    }

    #[test]
    fn loads_missing_file_as_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("app-settings.json");
        let loaded: Option<AppSettings> = read_json_opt(&path).unwrap();
        assert!(loaded.is_none());
    }

    #[test]
    fn older_file_loads_with_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("app-settings.json");
        // An old file only had `autostart`
        fs::write(&path, r#"{"autostart":true}"#).unwrap();

        let loaded: AppSettings = read_json_opt(&path).unwrap().unwrap();
        assert_eq!(loaded.schema_version, 1);
        assert!(loaded.autostart);
        assert!(!loaded.silent_start);
        assert!(!loaded.auto_connect);
        assert_eq!(loaded.auto_connect_mode, AutoConnectMode::Last);
    }

    #[test]
    fn unknown_future_fields_are_safely_ignored() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("app-settings.json");
        fs::write(
            &path,
            r#"{"schemaVersion":5,"autostart":false,"newFutureFeature":{"enabled":true},"autoConnectMode":"tun"}"#,
        )
        .unwrap();

        let loaded: AppSettings = read_json_opt(&path).unwrap().unwrap();
        assert_eq!(loaded.schema_version, 5);
        assert!(!loaded.autostart);
        assert_eq!(loaded.auto_connect_mode, AutoConnectMode::Tun);
    }
}
