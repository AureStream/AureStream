use serde::{Deserialize, Serialize};

/// 订阅源模型
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Subscription {
    pub id: String,
    pub name: String,
    pub url: String,
    pub sub_type: SubscriptionType,
    pub enabled: bool,
    pub auto_update: bool,
    pub update_interval: i64,         // 秒

    pub health_status: HealthStatus,
    pub health_message: Option<String>,

    pub node_count: i32,

    // 流量信息（来自订阅响应头 Subscription-Userinfo）
    pub traffic_upload: Option<i64>,
    pub traffic_download: Option<i64>,
    pub traffic_total: Option<i64>,
    pub expire_at: Option<i64>,

    pub last_success_at: Option<i64>,
    pub last_updated_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// 订阅格式类型
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SubscriptionType {
    Clash,
    V2ray,
    SingBox,
    Surge,
    Sip008,
    Auto,   // 自动检测
}

impl Default for SubscriptionType {
    fn default() -> Self {
        Self::Auto
    }
}

impl SubscriptionType {
    pub fn as_str(&self) -> &'static str {
        match self {
            SubscriptionType::Clash => "clash",
            SubscriptionType::V2ray => "v2ray",
            SubscriptionType::SingBox => "singbox",
            SubscriptionType::Surge => "surge",
            SubscriptionType::Sip008 => "sip008",
            SubscriptionType::Auto => "auto",
        }
    }
}

/// 订阅健康状态
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HealthStatus {
    Ok,
    Error,
    Expired,
}

impl Default for HealthStatus {
    fn default() -> Self {
        Self::Ok
    }
}

impl HealthStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            HealthStatus::Ok => "ok",
            HealthStatus::Error => "error",
            HealthStatus::Expired => "expired",
        }
    }
}
