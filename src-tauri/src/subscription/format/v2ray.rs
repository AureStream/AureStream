use super::FormatParser;
use crate::error::AppError;
use crate::models::endpoint::{AuthInfo, Protocol, TransportInfo, TransportNetwork};
use crate::models::{CanonicalFields, RawProxyNode, SourceFormat};

/// V2Ray URI 订阅：每行一个 `vmess://` / `vless://` / `trojan://` / `ss://` URI。
pub struct V2rayBase64Parser;

impl FormatParser for V2rayBase64Parser {
    fn name(&self) -> &'static str {
        "v2ray_base64"
    }

    fn can_parse(&self, content: &[u8]) -> bool {
        let decoded = try_decode_base64_lines(content);
        let s = match std::str::from_utf8(&decoded) {
            Ok(v) => v,
            Err(_) => return false,
        };
        let t = s.trim();
        if t.is_empty() {
            return false;
        }
        // 至少有一行以支持的 scheme 开头
        t.lines().any(|line| {
            let l = line.trim();
            l.starts_with("vmess://")
                || l.starts_with("vless://")
                || l.starts_with("trojan://")
                || l.starts_with("ss://")
        })
    }

    fn parse(&self, content: &[u8], _source_id: &str) -> Result<Vec<RawProxyNode>, AppError> {
        let decoded = try_decode_base64_lines(content);
        let s = std::str::from_utf8(&decoded)
            .map_err(|e| AppError::protocol("v2ray", format!("UTF-8 解码失败: {e}")))?;

        let mut out = Vec::new();
        for line in s.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            match parse_uri_line(line) {
                Ok(node) => out.push(node),
                Err(e) => tracing::warn!(uri = %line, error = %e, "跳过 URI 节点"),
            }
        }
        Ok(out)
    }
}

/// 尝试将整段内容做 base64 解码；若失败则返回原始字节。
fn try_decode_base64_lines(content: &[u8]) -> Vec<u8> {
    use base64::Engine;
    let s = match std::str::from_utf8(content) {
        Ok(v) => v.trim(),
        Err(_) => return content.to_vec(),
    };
    // 如果已经是明文 URI 行，直接返回
    if s.lines().any(|l| {
        let l = l.trim();
        l.starts_with("vmess://")
            || l.starts_with("vless://")
            || l.starts_with("trojan://")
            || l.starts_with("ss://")
    }) {
        return content.to_vec();
    }
    // 尝试 base64 解码
    match base64::engine::general_purpose::STANDARD.decode(s) {
        Ok(decoded) => decoded,
        Err(_) => content.to_vec(),
    }
}

fn parse_uri_line(line: &str) -> Result<RawProxyNode, AppError> {
    if line.starts_with("vmess://") {
        parse_vmess_uri(line)
    } else if line.starts_with("vless://") {
        parse_vless_uri(line)
    } else if line.starts_with("trojan://") {
        parse_trojan_uri(line)
    } else if line.starts_with("ss://") {
        parse_ss_uri(line)
    } else {
        Err(AppError::protocol("v2ray", format!("不支持的 URI scheme: {}", line)))
    }
}

// ── vmess:// ──────────────────────────────────────────────
// vmess://base64(json) — V2Ray VMess 标准分享链接格式
fn parse_vmess_uri(uri: &str) -> Result<RawProxyNode, AppError> {
    use base64::Engine;
    let b64 = uri.strip_prefix("vmess://").unwrap();
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(b64)
        .map_err(|e| AppError::protocol("vmess", format!("base64 解码失败: {e}")))?;
    let v: serde_json::Value = serde_json::from_slice(&decoded)
        .map_err(|e| AppError::protocol("vmess", format!("JSON 解析失败: {e}")))?;

    let obj = v
        .as_object()
        .ok_or_else(|| AppError::protocol("vmess", "JSON 不是对象"))?;

    let name = obj
        .get("ps")
        .and_then(|v| v.as_str())
        .unwrap_or("vmess-node")
        .trim()
        .to_string();
    let server = obj
        .get("add")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::protocol("vmess", "缺少 add (server)"))?
        .to_string();
    let port = obj
        .get("port")
        .and_then(|v| v.as_u64())
        .ok_or_else(|| AppError::protocol("vmess", "缺少 port"))? as u16;
    let uuid = obj
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let tls = obj
        .get("tls")
        .and_then(|v| v.as_str())
        .map(|s| s == "tls" || s == "1")
        .or_else(|| obj.get("tls").and_then(|v| v.as_bool()).map(|b| b))
        .unwrap_or(false);

    let network = obj
        .get("net")
        .and_then(|v| v.as_str())
        .and_then(|s| parse_net_type(s));

    let mut transport = TransportInfo::default();
    transport.host = obj.get("host").and_then(|v| v.as_str()).map(|s| s.to_string());
    transport.path = obj.get("path").and_then(|v| v.as_str()).map(|s| s.to_string());
    transport.sni = obj.get("sni").and_then(|v| v.as_str()).map(|s| s.to_string());
    transport.fingerprint = obj
        .get("fp")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    if let Some(alpn_str) = obj.get("alpn").and_then(|v| v.as_str()) {
        if !alpn_str.is_empty() {
            transport.alpn = Some(alpn_str.split(',').map(|s| s.trim().to_string()).collect());
        }
    }

    let method = obj
        .get("scy")
        .and_then(|v| v.as_str())
        .unwrap_or("auto")
        .to_string();

    let extra = serde_json::json!({
        "vmess_version": obj.get("v").and_then(|v| v.as_u64()).unwrap_or(2),
        "aid": obj.get("aid").and_then(|v| v.as_u64()).unwrap_or(0),
    });

    Ok(RawProxyNode {
        protocol: Protocol::Vmess,
        source_format: SourceFormat::V2ray,
        canonical: CanonicalFields {
            server,
            port,
            auth: AuthInfo {
                uuid: Some(uuid),
                method: Some(method),
                ..Default::default()
            },
            transport,
            tls,
            udp: false,
            name,
            network,
        },
        extra,
    })
}

// ── vless:// ──────────────────────────────────────────────
// vless://uuid@server:port?params#name
fn parse_vless_uri(uri: &str) -> Result<RawProxyNode, AppError> {
    let rest = uri.strip_prefix("vless://").unwrap();
    let (main_part, name) = split_fragment(rest);
    let (auth_server, query) = split_query(main_part);

    let (uuid, server, port) = parse_user_at_host_port(auth_server)
        .map_err(|e| AppError::protocol("vless", e))?;

    let params = parse_query_params(query);
    let tls = params.get("security").map(|s| s == "tls" || s == "reality").unwrap_or(false);
    let network = params.get("type").and_then(|s| parse_net_type(s));

    let mut transport = TransportInfo::default();
    transport.host = params.get("host").cloned();
    transport.path = params.get("path").cloned();
    transport.sni = params.get("sni").or(params.get("peer")).cloned();
    transport.fingerprint = params.get("fp").cloned();
    if let Some(alpn) = params.get("alpn") {
        if !alpn.is_empty() {
            transport.alpn = Some(alpn.split(',').map(|s| s.trim().to_string()).collect());
        }
    }
    if params.get("allowInsecure").map(|s| s == "1" || s == "true").unwrap_or(false) {
        transport.skip_cert_verify = Some(true);
    }

    let mut extra = serde_json::json!({});
    if let Some(flow) = params.get("flow") {
        extra["flow"] = serde_json::json!(flow);
    }

    Ok(RawProxyNode {
        protocol: Protocol::Vless,
        source_format: SourceFormat::V2ray,
        canonical: CanonicalFields {
            server,
            port,
            auth: AuthInfo {
                uuid: Some(uuid),
                ..Default::default()
            },
            transport,
            tls,
            udp: false,
            name: name.unwrap_or_else(|| "vless-node".to_string()),
            network,
        },
        extra,
    })
}

// ── trojan:// ─────────────────────────────────────────────
// trojan://password@server:port?params#name
fn parse_trojan_uri(uri: &str) -> Result<RawProxyNode, AppError> {
    let rest = uri.strip_prefix("trojan://").unwrap();
    let (main_part, name) = split_fragment(rest);
    let (auth_server, query) = split_query(main_part);

    let (password, server, port) = parse_user_at_host_port(auth_server)
        .map_err(|e| AppError::protocol("trojan", e))?;

    let params = parse_query_params(query);
    let network = params.get("type").and_then(|s| parse_net_type(s));

    let mut transport = TransportInfo::default();
    transport.host = params.get("host").cloned();
    transport.path = params.get("path").cloned();
    transport.sni = params.get("sni").or(params.get("peer")).cloned();
    transport.fingerprint = params.get("fp").cloned();
    if let Some(alpn) = params.get("alpn") {
        if !alpn.is_empty() {
            transport.alpn = Some(alpn.split(',').map(|s| s.trim().to_string()).collect());
        }
    }
    if params.get("allowInsecure").map(|s| s == "1" || s == "true").unwrap_or(false) {
        transport.skip_cert_verify = Some(true);
    }

    Ok(RawProxyNode {
        protocol: Protocol::Trojan,
        source_format: SourceFormat::V2ray,
        canonical: CanonicalFields {
            server,
            port,
            auth: AuthInfo {
                password: Some(password),
                ..Default::default()
            },
            transport,
            tls: true,
            udp: false,
            name: name.unwrap_or_else(|| "trojan-node".to_string()),
            network,
        },
        extra: serde_json::json!({}),
    })
}

// ── ss:// ─────────────────────────────────────────────────
// ss://base64(method:password)@server:port#name
// 或 ss://base64(method:password@server:port)#name
fn parse_ss_uri(uri: &str) -> Result<RawProxyNode, AppError> {
    use base64::Engine;
    let rest = uri.strip_prefix("ss://").unwrap();
    let (main_part, name) = split_fragment(rest);

    // 尝试分离 @server:port 部分
    if let Some(at_pos) = find_at_sign_for_ss(main_part) {
        // 格式: base64(method:password)@server:port
        let b64_part = &main_part[..at_pos];
        let host_part = &main_part[at_pos + 1..];

        let decoded = base64::engine::general_purpose::STANDARD
            .decode(b64_part)
            .or_else(|_| base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(b64_part))
            .map_err(|e| AppError::protocol("ss", format!("base64 解码失败: {e}")))?;
        let auth_str = std::str::from_utf8(&decoded)
            .map_err(|e| AppError::protocol("ss", format!("UTF-8 解码失败: {e}")))?;

        let (method, password) = auth_str
            .split_once(':')
            .ok_or_else(|| AppError::protocol("ss", "method:password 格式错误"))?;

        let (server, port) = parse_host_port(host_part)
            .map_err(|e| AppError::protocol("ss", e))?;

        Ok(RawProxyNode {
            protocol: Protocol::Ss,
            source_format: SourceFormat::V2ray,
            canonical: CanonicalFields {
                server,
                port,
                auth: AuthInfo {
                    method: Some(method.to_string()),
                    password: Some(password.to_string()),
                    ..Default::default()
                },
                transport: TransportInfo::default(),
                tls: false,
                udp: false,
                name: name.unwrap_or_else(|| "ss-node".to_string()),
                network: None,
            },
            extra: serde_json::json!({}),
        })
    } else {
        // 格式: base64(method:password@server:port) — 整段 base64
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(main_part)
            .or_else(|_| base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(main_part))
            .map_err(|e| AppError::protocol("ss", format!("base64 解码失败: {e}")))?;
        let full = std::str::from_utf8(&decoded)
            .map_err(|e| AppError::protocol("ss", format!("UTF-8 解码失败: {e}")))?;

        // method:password@server:port
        let (auth_part, host_part) = full
            .rsplit_once('@')
            .ok_or_else(|| AppError::protocol("ss", "无法解析 ss URI"))?;
        let (method, password) = auth_part
            .split_once(':')
            .ok_or_else(|| AppError::protocol("ss", "method:password 格式错误"))?;
        let (server, port) = parse_host_port(host_part)
            .map_err(|e| AppError::protocol("ss", e))?;

        Ok(RawProxyNode {
            protocol: Protocol::Ss,
            source_format: SourceFormat::V2ray,
            canonical: CanonicalFields {
                server,
                port,
                auth: AuthInfo {
                    method: Some(method.to_string()),
                    password: Some(password.to_string()),
                    ..Default::default()
                },
                transport: TransportInfo::default(),
                tls: false,
                udp: false,
                name: name.unwrap_or_else(|| "ss-node".to_string()),
                network: None,
            },
            extra: serde_json::json!({}),
        })
    }
}

// ── 通用 URI 解析辅助 ─────────────────────────────────────

/// 分离 `#fragment`，返回 (main, Some(name)) 或 (main, None)
fn split_fragment(s: &str) -> (&str, Option<String>) {
    if let Some(pos) = s.find('#') {
        let name = percent_decode(&s[pos + 1..]);
        (&s[..pos], Some(name))
    } else {
        (s, None)
    }
}

/// 分离 `?query`，返回 (main, query_string)
fn split_query(s: &str) -> (&str, &str) {
    if let Some(pos) = s.find('?') {
        (&s[..pos], &s[pos + 1..])
    } else {
        (s, "")
    }
}

/// 解析 `user@host:port` 格式，返回 (user, host, port)
fn parse_user_at_host_port(s: &str) -> Result<(String, String, u16), String> {
    let (user, host_port) = s
        .rsplit_once('@')
        .ok_or_else(|| format!("缺少 @ 分隔符: {s}"))?;
    let user = percent_decode(user);
    let (host, port) = parse_host_port(host_port)?;
    Ok((user, host, port))
}

/// 解析 `host:port` 或 `[ipv6]:port`
fn parse_host_port(s: &str) -> Result<(String, u16), String> {
    if s.starts_with('[') {
        // IPv6: [::1]:port
        let end = s.find(']').ok_or("IPv6 地址缺少 ]")?;
        let host = s[1..end].to_string();
        let port_str = s[end + 1..].strip_prefix(':').ok_or("缺少端口号")?;
        let port: u16 = port_str.parse().map_err(|_| format!("端口号无效: {port_str}"))?;
        Ok((host, port))
    } else {
        let (host, port_str) = s
            .rsplit_once(':')
            .ok_or_else(|| format!("缺少端口号: {s}"))?;
        let port: u16 = port_str.parse().map_err(|_| format!("端口号无效: {port_str}"))?;
        Ok((host.to_string(), port))
    }
}

/// 解析 query string 为 HashMap
fn parse_query_params(query: &str) -> std::collections::HashMap<String, String> {
    let mut map = std::collections::HashMap::new();
    for pair in query.split('&') {
        if let Some((k, v)) = pair.split_once('=') {
            map.insert(
                percent_decode(k),
                percent_decode(v),
            );
        }
    }
    map
}

/// URL percent-decode（手动实现，避免额外依赖）
fn percent_decode(s: &str) -> String {
    let mut out = Vec::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(hi), Some(lo)) = (hex_val(bytes[i + 1]), hex_val(bytes[i + 2])) {
                out.push(hi << 4 | lo);
                i += 3;
                continue;
            }
        }
        if bytes[i] == b'+' {
            out.push(b' ');
        } else {
            out.push(bytes[i]);
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn hex_val(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

/// 解析 net/type 字段为 TransportNetwork
fn parse_net_type(s: &str) -> Option<TransportNetwork> {
    match s.to_lowercase().as_str() {
        "tcp" => Some(TransportNetwork::Tcp),
        "ws" | "websocket" => Some(TransportNetwork::Ws),
        "grpc" | "gun" => Some(TransportNetwork::Grpc),
        "h2" | "http" => Some(TransportNetwork::Http2),
        "quic" => Some(TransportNetwork::Quic),
        _ => None,
    }
}

/// 在 ss:// URI 中找到正确的 @ 位置（base64 内可能包含 @）
fn find_at_sign_for_ss(s: &str) -> Option<usize> {
    // 从右往左找 @，因为 host:port 部分不会包含 @
    // 但 base64 编码的 method:password 也不会包含 @
    // 所以直接找第一个 @ 即可
    s.find('@')
}
