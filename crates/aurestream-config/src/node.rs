use std::fmt;

/// Optional TLS-ClientHello fragmentation hint (engine maps to its dialect).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FragmentSpec {
    pub packets: String,
    pub length: String,
    pub interval: String,
}

/// Engine-agnostic proxy node decoded from a subscription URI or document.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProxyNode {
    pub tag: String,
    pub name: String,
    pub protocol: String,
    pub server: String,
    pub port: u16,
    /// VLESS / VMess user id.
    pub uuid: Option<String>,
    /// Trojan / Shadowsocks / Hysteria2 secret.
    pub password: Option<String>,
    pub encryption: Option<String>,
    pub flow: Option<String>,
    /// Shadowsocks cipher.
    pub method: Option<String>,
    /// Transport: tcp, ws, grpc, httpupgrade, xhttp, …
    pub network: String,
    pub path: Option<String>,
    /// WebSocket / HTTP upgrade Host header.
    pub host: Option<String>,
    /// gRPC service name.
    pub grpc_service_name: Option<String>,
    /// none | tls | reality
    pub security: String,
    pub sni: Option<String>,
    pub fingerprint: Option<String>,
    pub alpn: Option<Vec<String>>,
    pub allow_insecure: bool,
    pub reality_public_key: Option<String>,
    pub reality_short_id: Option<String>,
    pub reality_spider_x: Option<String>,
    pub fragment: Option<FragmentSpec>,
}

impl ProxyNode {
    pub fn new(tag: impl Into<String>, protocol: impl Into<String>, server: impl Into<String>, port: u16) -> Self {
        let tag = tag.into();
        Self {
            name: tag.clone(),
            tag,
            protocol: protocol.into(),
            server: server.into(),
            port,
            uuid: None,
            password: None,
            encryption: None,
            flow: None,
            method: None,
            network: "tcp".into(),
            path: None,
            host: None,
            grpc_service_name: None,
            security: "none".into(),
            sni: None,
            fingerprint: None,
            alpn: None,
            allow_insecure: false,
            reality_public_key: None,
            reality_short_id: None,
            reality_spider_x: None,
            fragment: None,
        }
    }
}

/// Subscription decode failure.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConfigError {
    message: String,
}

impl ConfigError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl fmt::Display for ConfigError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for ConfigError {}
