use serde::{Deserialize, Serialize};

use super::endpoint::Endpoint;

/// 传递给 CoreAdapter 的运行时描述。
///
/// CoreAdapter 通过此结构体理解"要怎么运行"，
/// 不依赖任何 UI 概念（无 Clash group / proxy-group）。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeProfile {
    pub endpoints: Vec<Endpoint>,
    pub selected_node_id: Option<String>,
    pub policy: RuntimePolicy,
    pub dns: DnsProfile,
    #[serde(default)]
    pub tun: TunProfile,
    pub listen: String,
    pub mixed_port: u16,
}

/// TUN 占位；后续由 network/tun 填充
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TunProfile {
    pub enabled: bool,
}

impl Default for TunProfile {
    fn default() -> Self {
        Self { enabled: false }
    }
}

/// 路由策略（Adapter 内部负责映射到具体内核语义）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimePolicy {
    pub routing_mode: RoutingMode,
    pub outbound_strategy: OutboundStrategy,
}

impl Default for RuntimePolicy {
    fn default() -> Self {
        Self {
            routing_mode: RoutingMode::RuleBased,
            outbound_strategy: OutboundStrategy::Selected(String::new()),
        }
    }
}

/// 路由模式
/// - `RuleBased`：Mihomo → rule，sing-box → route rules
/// - `FullTunnel`：Mihomo → global，sing-box → disable direct
/// - `Direct`：全部直连
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RoutingMode {
    RuleBased,
    FullTunnel,
    Direct,
}

/// 出站策略
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum OutboundStrategy {
    Selected(String),           // 手动选择节点 ID
    AutoBest,                   // 自动最优延迟
    Fallback(Vec<String>),      // 故障转移链
}

/// DNS 配置（最小化）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DnsProfile {
    pub enabled: bool,
    pub mode: DnsMode,
    pub nameservers: Vec<String>,
    pub fake_ip_range: Option<String>,
}

impl Default for DnsProfile {
    fn default() -> Self {
        Self {
            enabled: true,
            mode: DnsMode::FakeIp,
            nameservers: vec![
                "https://doh.pub/dns-query".to_string(),
                "https://dns.alidns.com/dns-query".to_string(),
            ],
            fake_ip_range: Some("198.18.0.1/16".to_string()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DnsMode {
    Normal,
    FakeIp,
    RedirHost,
}

/// 当前运行会话（支持故障转移、多 profile 扩展）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeSession {
    pub session_id: String,
    pub current_node_id: Option<String>,
    pub current_core: String,    // "mihomo" / "singbox"
    pub policy: RuntimePolicy,
    pub started_at: i64,         // Unix timestamp
}
