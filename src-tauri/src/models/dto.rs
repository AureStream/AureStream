//! 前端 IPC 传输对象（DTO）。
//!
//! 这些类型仅用于序列化/反序列化 JSON，内部模型使用 [`super::Subscription`] 和 [`super::Endpoint`]。

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Provider {
    pub id: String,
    pub name: String,
    pub url: String,
    pub last_updated: String,
    pub node_count: usize,
    #[serde(rename = "trafficTotalGB")]
    pub traffic_total_gb: Option<f64>,
    #[serde(rename = "trafficUsedGB")]
    pub traffic_used_gb: Option<f64>,
    pub expires_at: Option<String>,
    pub auto_update_interval: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Node {
    pub id: String,
    pub name: String,
    pub provider_id: String,
    #[serde(alias = "node_type")]
    pub r#type: String,
    pub server: String,
    pub port: u16,
    pub delay: Option<u32>,
    pub enabled: bool,
}
