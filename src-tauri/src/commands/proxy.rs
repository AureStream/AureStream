use crate::commands::{ProxyConfig, ProxyStatus};
use std::sync::Mutex;

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
