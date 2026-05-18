use super::FormatParser;
use crate::error::AppError;
use crate::models::endpoint::{AuthInfo, Protocol, TransportInfo, TransportNetwork};
use crate::models::{CanonicalFields, RawProxyNode, SourceFormat};
use serde_yaml::{Mapping, Value};
use std::collections::HashSet;

/// Clash YAML：`proxies:` → RawProxyNode
pub struct ClashYamlParser;

fn key(s: &str) -> Value {
    Value::String(s.to_string())
}

/// 顶层 `proxies:` 或根即为节点序列（少数订阅无 proxies 键）。
fn proxies_sequence(root: &Value) -> Option<&serde_yaml::Sequence> {
    root.get(&key("proxies"))
        .and_then(|v| v.as_sequence())
        .or_else(|| root.as_sequence())
}

fn get_str(m: &Mapping, k: &str) -> Option<String> {
    m.get(&key(k)).and_then(|v| match v {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        Value::Bool(b) => Some(if *b { "true".into() } else { "false".into() }),
        _ => None,
    })
}

fn get_u16(m: &Mapping, k: &str) -> Option<u16> {
    m.get(&key(k)).and_then(|v| match v {
        Value::Number(n) => n.as_u64().and_then(|u| u16::try_from(u).ok()),
        Value::String(s) => s.parse().ok(),
        _ => None,
    })
}

fn get_bool(m: &Mapping, k: &str) -> bool {
    m.get(&key(k))
        .map(|v| match v {
            Value::Bool(b) => *b,
            Value::String(s) => {
                s.eq_ignore_ascii_case("true") || s == "1" || s.eq_ignore_ascii_case("yes")
            }
            Value::Number(n) => n.as_i64() == Some(1),
            _ => false,
        })
        .unwrap_or(false)
}

fn get_sub<'a>(m: &'a Mapping, k: &str) -> Option<&'a Mapping> {
    m.get(&key(k)).and_then(|v| v.as_mapping())
}

fn parse_network_str(s: &str) -> Option<TransportNetwork> {
    match s.to_lowercase().as_str() {
        "ws" => Some(TransportNetwork::Ws),
        "grpc" => Some(TransportNetwork::Grpc),
        "h2" => Some(TransportNetwork::Http2),
        "tcp" => Some(TransportNetwork::Tcp),
        "http" => Some(TransportNetwork::Tcp),
        "quic" => Some(TransportNetwork::Quic),
        _ => None,
    }
}

fn merge_transport_tls(map: &Mapping, transport: &mut TransportInfo, tls: &mut bool) {
    transport.sni = get_str(map, "sni").or_else(|| get_str(map, "servername"));
    transport.fingerprint = get_str(map, "client-fingerprint");
    if get_bool(map, "skip-cert-verify") {
        transport.skip_cert_verify = Some(true);
    }
    *tls = *tls || get_bool(map, "tls");

    if let Some(ws) = get_sub(map, "ws-opts") {
        transport.path = get_str(ws, "path");
        if let Some(headers) = ws.get(&key("headers")).and_then(|v| v.as_mapping()) {
            for (hk, hv) in headers {
                let Some(hks) = hk.as_str() else { continue };
                if hks.eq_ignore_ascii_case("host") {
                    transport.host = hv.as_str().map(|s| s.to_string());
                    break;
                }
            }
        }
    }

    if let Some(g) = get_sub(map, "grpc-opts") {
        transport.path = get_str(g, "grpc-service-name");
    }
}

fn clash_proxy_to_raw(map: &Mapping, _source_id: &str) -> Result<RawProxyNode, AppError> {
    let typ = get_str(map, "type")
        .ok_or_else(|| AppError::protocol("clash", "缺少 type"))?
        .to_lowercase();
    let name = get_str(map, "name")
        .ok_or_else(|| AppError::protocol("clash", "缺少 name"))?
        .trim()
        .to_string();
    let server = get_str(map, "server").ok_or_else(|| AppError::protocol("clash", "缺少 server"))?;
    let port = get_u16(map, "port").ok_or_else(|| AppError::protocol("clash", "缺少 port"))?;

    let protocol = match typ.as_str() {
        "ss" | "shadowsocks" => Protocol::Ss,
        "vmess" => Protocol::Vmess,
        "vless" => Protocol::Vless,
        "trojan" => Protocol::Trojan,
        "socks5" | "socks" => Protocol::Socks5,
        "http" => Protocol::Http,
        "tuic" => Protocol::Tuic,
        "hysteria2" | "hy2" => Protocol::Hysteria2,
        _ => {
            return Err(AppError::protocol(
                typ.as_str(),
                "暂不支持的 Clash 代理类型",
            ));
        }
    };

    let mut auth = AuthInfo::default();
    let mut transport = TransportInfo::default();
    let udp = get_bool(map, "udp");
    let mut tls = false;

    match protocol {
        Protocol::Ss => {
            auth.method = get_str(map, "cipher");
            auth.password = get_str(map, "password");
        }
        Protocol::Vmess => {
            auth.uuid = get_str(map, "uuid");
            auth.method = Some(get_str(map, "cipher").unwrap_or_else(|| "auto".into()));
            tls = get_bool(map, "tls");
        }
        Protocol::Vless => {
            auth.uuid = get_str(map, "uuid");
            tls = get_bool(map, "tls");
        }
        Protocol::Trojan => {
            auth.password = get_str(map, "password");
            tls = true;
        }
        Protocol::Socks5 => {
            auth.password = get_str(map, "password");
        }
        Protocol::Http => {
            auth.password = get_str(map, "password");
        }
        Protocol::Tuic => {
            auth.uuid = get_str(map, "uuid");
            auth.password = get_str(map, "password");
            auth.token = get_str(map, "token");
            tls = true;
        }
        Protocol::Hysteria2 => {
            auth.password = get_str(map, "password");
            tls = true;
        }
    }

    merge_transport_tls(map, &mut transport, &mut tls);

    let network = get_str(map, "network")
        .map(|s| s.to_lowercase())
        .and_then(|s| parse_network_str(&s));

    let mut extra = serde_json::json!({});
    if let Some(obj) = extra.as_object_mut() {
        obj.insert(
            "clash_type".into(),
            serde_json::Value::String(typ.clone()),
        );
        if let Some(u) = get_str(map, "username") {
            obj.insert("username".into(), serde_json::Value::String(u));
        }
        if let Some(flow) = get_str(map, "flow") {
            obj.insert("flow".into(), serde_json::Value::String(flow));
        }
        if let Some(alter) = map.get(&key("alterId")).and_then(|v| serde_json::to_value(v).ok()) {
            obj.insert("alterId".into(), alter);
        }
        if let Some(alpn) = map.get(&key("alpn")).and_then(|v| serde_json::to_value(v).ok()) {
            obj.insert("alpn".into(), alpn);
        }
    }

    match protocol {
        Protocol::Vmess | Protocol::Vless => {
            if auth.uuid.as_ref().map(|s| s.trim().is_empty()).unwrap_or(true) {
                return Err(AppError::protocol("clash", "vmess/vless 缺少 uuid"));
            }
        }
        Protocol::Trojan => {
            if auth.password.as_ref().map(|s| s.trim().is_empty()).unwrap_or(true) {
                return Err(AppError::protocol("clash", "trojan 缺少 password"));
            }
        }
        Protocol::Ss => {
            if auth.password.as_ref().map(|s| s.trim().is_empty()).unwrap_or(true) {
                return Err(AppError::protocol("clash", "shadowsocks 缺少 password"));
            }
        }
        _ => {}
    }

    Ok(RawProxyNode {
        protocol,
        source_format: SourceFormat::Clash,
        canonical: CanonicalFields {
            server,
            port,
            auth,
            transport,
            tls,
            udp,
            name,
            network,
        },
        extra,
    })
}

impl FormatParser for ClashYamlParser {
    fn name(&self) -> &'static str {
        "clash_yaml"
    }

    fn can_parse(&self, content: &[u8]) -> bool {
        let Ok(s) = std::str::from_utf8(content) else {
            return false;
        };
        let t = s.trim_start_matches('\u{feff}');
        let lower = t.to_ascii_lowercase();
        // 常见 Clash / Mihomo 订阅仅有 proxies，无 proxy-groups / rules
        if lower.contains("proxies:") || lower.contains("\"proxies\"") {
            return true;
        }
        // 裸列表 `- name: ...` / `- {name: ...`
        let trim = t.trim_start();
        trim.starts_with("- ")
            && (lower.contains("type:") || lower.contains("\ntype:"))
    }

    fn parse(&self, content: &[u8], source_id: &str) -> Result<Vec<crate::models::RawProxyNode>, AppError> {
        let root: Value =
            serde_yaml::from_slice(content).map_err(|e| AppError::other(format!("YAML 解析失败: {e}")))?;
        let Some(seq) = proxies_sequence(&root) else {
            return Err(AppError::UnknownFormat);
        };

        let mut seen = HashSet::<String>::new();
        let mut out = Vec::new();

        for item in seq {
            let Some(map) = item.as_mapping() else {
                continue;
            };
            let Some(name) = get_str(map, "name") else {
                continue;
            };
            let name_trim = name.trim().to_string();
            if name_trim.is_empty() {
                continue;
            }
            if !seen.insert(name_trim.clone()) {
                tracing::warn!(%name_trim, "跳过重复节点名");
                continue;
            }

            match clash_proxy_to_raw(map, source_id) {
                Ok(raw) => out.push(raw),
                Err(e) => tracing::warn!(name = %name_trim, error = %e, "跳过节点"),
            }
        }

        Ok(out)
    }
}
