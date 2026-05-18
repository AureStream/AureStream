use serde::{Deserialize, Serialize};

use super::endpoint::{AuthInfo, Protocol, TransportInfo, TransportNetwork};

/// FormatParser 输出 → ProtocolParser 输入（技术设计 §4.2）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawProxyNode {
    pub protocol: Protocol,
    pub source_format: SourceFormat,
    pub canonical: CanonicalFields,
    pub extra: serde_json::Value,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SourceFormat {
    Clash,
    V2ray,
    SingBox,
    Surge,
    Sip008,
}

/// 标准化契约：FormatParser 必须填充；ProtocolParser 只读 canonical + extra
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanonicalFields {
    pub server: String,
    pub port: u16,
    pub auth: AuthInfo,
    pub transport: TransportInfo,
    pub tls: bool,
    pub udp: bool,
    pub name: String,
    #[serde(default)]
    pub network: Option<TransportNetwork>,
}
