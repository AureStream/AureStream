use serde::{Deserialize, Serialize};

/// 连接状态机
///
/// 状态转换规则：
/// ```text
/// Disconnected → Connecting → Connected ↔ Switching
///                           ↓
///                         Error
///                           ↓
///                       Disconnected
/// ```
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionState {
    #[default]
    Disconnected,
    Connecting,
    Connected,
    Switching,
    Error,
}

impl ConnectionState {
    pub fn as_str(&self) -> &'static str {
        match self {
            ConnectionState::Disconnected => "disconnected",
            ConnectionState::Connecting => "connecting",
            ConnectionState::Connected => "connected",
            ConnectionState::Switching => "switching",
            ConnectionState::Error => "error",
        }
    }

    /// 是否可以发起新的连接请求
    pub fn can_connect(&self) -> bool {
        matches!(self, Self::Disconnected | Self::Error)
    }

    /// 是否可以切换节点（不重启内核）
    pub fn can_switch(&self) -> bool {
        matches!(self, Self::Connected)
    }

    /// 是否可以断开
    pub fn can_disconnect(&self) -> bool {
        !matches!(self, Self::Disconnected)
    }
}
