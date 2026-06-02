use serde::Serialize;
use std::sync::Mutex;

#[derive(Serialize, Clone)]
pub struct DeepLinkPayload {
    pub data: String,
    pub apply: bool,
}

pub struct AppData {
    pub cached_cn_dns: Mutex<Option<String>>,
    pub cached_global_dns: Mutex<Option<String>>,
    pub log_buffer: Mutex<Vec<String>>,
    pub error_log_buffer: Mutex<Vec<String>>,
    pub pending_deep_link: Mutex<Option<DeepLinkPayload>>,
}

pub enum LogType {
    Info,
    Error,
}

impl AppData {
    pub fn new() -> Self {
        Self {
            log_buffer: Mutex::new(Vec::new()),
            error_log_buffer: Mutex::new(Vec::new()),
            cached_cn_dns: Mutex::new(None),
            cached_global_dns: Mutex::new(None),
            pending_deep_link: Mutex::new(None),
        }
    }

    pub fn write(&self, log: String, log_type: LogType) {
        let buffer = match log_type {
            LogType::Info => &self.log_buffer,
            LogType::Error => &self.error_log_buffer,
        };

        if let Ok(mut buffer) = buffer.lock() {
            buffer.push(log);
            if buffer.len() > 10 {
                buffer.remove(0);
            }
        }
    }

    pub fn read_cleared(&self, log_type: LogType) -> String {
        let buffer = match log_type {
            LogType::Info => &self.log_buffer,
            LogType::Error => &self.error_log_buffer,
        };

        if let Ok(mut buffer) = buffer.lock() {
            let logs = buffer.join("\n");
            buffer.clear();
            logs
        } else {
            String::new()
        }
    }

    pub fn get_cached_cn_dns(&self) -> Option<String> {
        if let Ok(cache) = self.cached_cn_dns.lock() {
            cache.clone()
        } else {
            None
        }
    }

    pub fn set_cached_cn_dns(&self, dns: Option<String>) {
        if let Ok(mut cache) = self.cached_cn_dns.lock() {
            *cache = dns;
        }
    }

    pub fn get_cached_global_dns(&self) -> Option<String> {
        if let Ok(cache) = self.cached_global_dns.lock() {
            cache.clone()
        } else {
            None
        }
    }

    pub fn set_cached_global_dns(&self, dns: Option<String>) {
        if let Ok(mut cache) = self.cached_global_dns.lock() {
            *cache = dns;
        }
    }

}
