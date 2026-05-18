/// AureStream 统一错误类型。
///
/// IPC 层统一通过 `.map_err(|e| e.to_string())` 转换给前端，
/// 内部各模块通过 `?` 传播。
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    // ── 数据库 ──────────────────────────────────────────
    #[error("数据库错误: {0}")]
    Database(#[from] sqlx::Error),

    #[error("数据库迁移失败: {0}")]
    Migration(#[from] sqlx::migrate::MigrateError),

    // ── IO / 序列化 ──────────────────────────────────────
    #[error("IO 错误: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON 序列化/反序列化失败: {0}")]
    Json(#[from] serde_json::Error),

    #[error("YAML 解析失败: {0}")]
    Yaml(#[from] serde_yaml::Error),

    // ── 网络 ──────────────────────────────────────────────
    #[error("HTTP 请求失败: {0}")]
    Http(#[from] reqwest::Error),

    // ── 解析 ──────────────────────────────────────────────
    #[error("订阅格式无法识别")]
    UnknownFormat,

    #[error("协议解析失败 [{protocol}]: {reason}")]
    ProtocolParse { protocol: String, reason: String },

    #[error("订阅内容为空")]
    EmptySubscription,

    // ── 内核 ──────────────────────────────────────────────
    #[error("内核未运行")]
    CoreNotRunning,

    #[error("内核启动失败: {0}")]
    CoreStartFailed(String),

    #[error("内核 API 调用失败: {0}")]
    CoreApiError(String),

    // ── 状态 ──────────────────────────────────────────────
    #[error("状态转换非法: {from} → {to}")]
    InvalidStateTransition { from: String, to: String },

    // ── 通用 ──────────────────────────────────────────────
    #[error("{0}")]
    Other(String),
}

impl AppError {
    pub fn other(msg: impl Into<String>) -> Self {
        Self::Other(msg.into())
    }

    pub fn protocol(protocol: impl Into<String>, reason: impl Into<String>) -> Self {
        Self::ProtocolParse {
            protocol: protocol.into(),
            reason: reason.into(),
        }
    }
}

/// IPC 层便捷转换
impl From<AppError> for String {
    fn from(e: AppError) -> Self {
        e.to_string()
    }
}
