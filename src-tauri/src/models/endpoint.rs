use serde::{Deserialize, Serialize};

/// 统一代理节点模型（技术设计 §4.1）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Endpoint {
    pub id: String,
    pub name: String,
    pub protocol: Protocol,
    pub server: String,
    pub port: u16,
    pub udp: bool,
    pub tls: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub network: Option<TransportNetwork>,
    pub auth: AuthInfo,
    pub transport: TransportInfo,
    pub metadata: EndpointMetadata,
    pub source_id: String,
    pub unique_hash: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw: Option<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Protocol {
    Ss,
    Vmess,
    Vless,
    Trojan,
    Tuic,
    Hysteria2,
    Socks5,
    Http,
}

impl Protocol {
    pub fn as_str(&self) -> &'static str {
        match self {
            Protocol::Ss => "ss",
            Protocol::Vmess => "vmess",
            Protocol::Vless => "vless",
            Protocol::Trojan => "trojan",
            Protocol::Tuic => "tuic",
            Protocol::Hysteria2 => "hysteria2",
            Protocol::Socks5 => "socks5",
            Protocol::Http => "http",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "ss" | "shadowsocks" => Some(Protocol::Ss),
            "vmess" => Some(Protocol::Vmess),
            "vless" => Some(Protocol::Vless),
            "trojan" => Some(Protocol::Trojan),
            "tuic" => Some(Protocol::Tuic),
            "hysteria2" | "hy2" => Some(Protocol::Hysteria2),
            "socks5" | "socks" => Some(Protocol::Socks5),
            "http" => Some(Protocol::Http),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AuthInfo {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uuid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub method: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TransportNetwork {
    Tcp,
    Ws,
    Grpc,
    Http2,
    Quic,
}

impl TransportNetwork {
    pub fn as_str(&self) -> &'static str {
        match self {
            TransportNetwork::Tcp => "tcp",
            TransportNetwork::Ws => "ws",
            TransportNetwork::Grpc => "grpc",
            TransportNetwork::Http2 => "http2",
            TransportNetwork::Quic => "quic",
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TransportInfo {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub host: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sni: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub alpn: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fingerprint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skip_cert_verify: Option<bool>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct EndpointMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub country: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub city: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latency: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
}

impl Endpoint {
    /// 连接语义哈希（技术设计 §4.2.1）
    pub fn compute_unique_hash(&self) -> String {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(self.protocol.as_str().as_bytes());
        hasher.update(self.server.as_bytes());
        hasher.update(self.port.to_string().as_bytes());
        hasher.update(self.auth.uuid.as_deref().unwrap_or("").as_bytes());
        hasher.update(self.auth.password.as_deref().unwrap_or("").as_bytes());
        hasher.update(self.transport.host.as_deref().unwrap_or("").as_bytes());
        hasher.update(self.transport.path.as_deref().unwrap_or("").as_bytes());
        hasher.update(self.transport.sni.as_deref().unwrap_or("").as_bytes());
        hex::encode(hasher.finalize())
    }

    /// 计算并设置 `unique_hash`，返回自身。
    pub fn with_hash(mut self) -> Self {
        self.unique_hash = self.compute_unique_hash();
        self
    }
}
