use serde::{Deserialize, Serialize};

/// 内核流量累计（遥测面）
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TrafficStats {
    pub upload_total: u64,
    pub download_total: u64,
}

/// 单节点延迟测试结果（遥测面 + IPC 统一类型）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LatencySample {
    pub node_id: String,
    pub delay: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}
