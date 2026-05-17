use serde::{Deserialize, Serialize};

/// 内核流量累计（遥测面）
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TrafficStats {
    pub upload_total: u64,
    pub download_total: u64,
}

/// 单节点延迟测试结果（遥测面）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LatencySample {
    pub node_id: String,
    pub latency_ms: Option<u32>,
}
