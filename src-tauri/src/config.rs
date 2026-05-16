use log::warn;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard};
use tauri::{AppHandle, Manager};

use crate::commands::DEFAULT_PROXY_BYPASS_DOMAINS;

fn default_theme() -> String {
    "light".to_string()
}

fn default_bypass() -> String {
    DEFAULT_PROXY_BYPASS_DOMAINS.to_string()
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AureConfig {
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default = "default_bypass")]
    pub proxy_bypass_domains: String,
    #[serde(default)]
    pub auto_start: bool,
    #[serde(default)]
    pub auto_connect: bool,
    #[serde(default)]
    pub latency_cache: HashMap<String, u32>,
    #[serde(default)]
    pub providers: Vec<ProviderEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderEntry {
    pub id: String,
    pub name: String,
    pub url: String,
    #[serde(default)]
    pub last_updated: String,
    #[serde(default)]
    pub node_count: usize,
    pub traffic_total_gb: Option<f64>,
    pub traffic_used_gb: Option<f64>,
    pub expires_at: Option<String>,
    pub auto_update_interval: Option<u32>,
    #[serde(default)]
    pub nodes: Vec<NodeEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeEntry {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub node_type: String,
    pub server: String,
    pub port: u16,
    pub delay: Option<u32>,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

impl Default for AureConfig {
    fn default() -> Self {
        Self {
            theme: default_theme(),
            proxy_bypass_domains: default_bypass(),
            auto_start: false,
            auto_connect: false,
            latency_cache: HashMap::new(),
            providers: Vec::new(),
        }
    }
}

pub struct AureConfigState {
    inner: Mutex<AureConfig>,
    path: PathBuf,
}

impl AureConfigState {
    pub fn load(app: &AppHandle) -> Result<Self, String> {
        let config_dir = app
            .path()
            .app_config_dir()
            .map_err(|e| format!("无法获取配置目录: {}", e))?;

        std::fs::create_dir_all(&config_dir).map_err(|e| format!("创建配置目录失败: {}", e))?;

        let path = config_dir.join("aurestream.yaml");
        let config = if path.exists() {
            let text =
                std::fs::read_to_string(&path).map_err(|e| format!("读取配置文件失败: {}", e))?;
            serde_yaml::from_str(&text).unwrap_or_else(|e| {
                warn!("[config] 解析 aurestream.yaml 失败，使用默认值: {}", e);
                AureConfig::default()
            })
        } else {
            AureConfig::default()
        };

        Ok(Self {
            inner: Mutex::new(config),
            path,
        })
    }

    pub fn get(&self) -> MutexGuard<'_, AureConfig> {
        self.inner.lock().expect("AureConfigState mutex poisoned")
    }

    #[allow(dead_code)]
    pub fn save(&self) -> Result<(), String> {
        let config = self.get();
        self.save_inner(&config)
    }

    fn save_inner(&self, config: &AureConfig) -> Result<(), String> {
        let text = serde_yaml::to_string(config).map_err(|e| format!("序列化配置失败: {}", e))?;

        let tmp_path = self.path.with_extension("yaml.tmp");
        std::fs::write(&tmp_path, text.as_bytes())
            .map_err(|e| format!("写入配置文件失败: {}", e))?;
        std::fs::rename(&tmp_path, &self.path).map_err(|e| format!("重命名配置文件失败: {}", e))?;

        Ok(())
    }

    pub fn get_mut_and_save<F>(&self, f: F) -> Result<(), String>
    where
        F: FnOnce(&mut AureConfig),
    {
        let mut config = self.inner.lock().expect("AureConfigState mutex poisoned");
        f(&mut config);
        self.save_inner(&config)
    }
}
