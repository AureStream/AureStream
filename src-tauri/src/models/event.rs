use serde::{Deserialize, Serialize};

use super::state::ConnectionState;

/// 应用事件总线定义。
///
/// 分为两类通道：
/// - **Control**：低频、关键，UI 状态驱动
/// - **Telemetry**：高频，可丢弃旧数据
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AppEvent {
    // ── Control Channel ─────────────────────────────────────
    ConnectionStateChanged {
        state: ConnectionState,
        node_id: Option<String>,
    },
    SubscriptionUpdated {
        id: String,
        node_count: i32,
    },
    CoreStarted {
        core_type: String,
        version: String,
    },
    CoreStopped,
    Error {
        message: String,
    },

    // ── Telemetry Channel ────────────────────────────────────
    TrafficUpdated {
        upload_bytes: u64,
        download_bytes: u64,
        upload_speed: u64,
        download_speed: u64,
    },
    NodeLatencyTested {
        node_id: String,
        latency_ms: Option<u32>,
    },
    CoreLog {
        level: String,
        message: String,
    },
}

impl AppEvent {
    /// 是否为高频遥测事件（应走独立 telemetry channel）
    pub fn is_telemetry(&self) -> bool {
        matches!(
            self,
            Self::TrafficUpdated { .. } | Self::NodeLatencyTested { .. } | Self::CoreLog { .. }
        )
    }
}
