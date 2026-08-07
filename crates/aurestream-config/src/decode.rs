use std::collections::HashMap;

use base64::Engine as _;

use crate::node::{ConfigError, FragmentSpec, ProxyNode};

/// Decode a subscription response body into engine-agnostic proxy nodes.
pub fn decode_subscription_body(body: &str) -> Result<Vec<ProxyNode>, ConfigError> {
    let trimmed = body.trim();
    if trimmed.is_empty() {
        return Err(ConfigError::new(
            "Cannot parse subscription: empty body",
        ));
    }

    if let Ok(nodes) = try_decode_base64_list(trimmed) {
        if !nodes.is_empty() {
            return Ok(nodes);
        }
    }

    let nodes = parse_proxy_list(trimmed);
    if !nodes.is_empty() {
        return Ok(nodes);
    }

    Err(ConfigError::new(
        "Cannot parse subscription: not a recognized proxy list format",
    ))
}

fn try_decode_base64_list(body: &str) -> Result<Vec<ProxyNode>, ConfigError> {
    let decoded = decode_base64(body)?;
    Ok(parse_proxy_list(&decoded))
}

fn decode_base64(input: &str) -> Result<String, ConfigError> {
    let cleaned: String = input.chars().filter(|c| !c.is_whitespace()).collect();
    let engine = base64::engine::general_purpose::STANDARD;
    if let Ok(bytes) = engine.decode(&cleaned) {
        return String::from_utf8(bytes)
            .map_err(|_| ConfigError::new("Base64 decode failed: invalid UTF-8"));
    }

    let url_safe = cleaned.replace('-', "+").replace('_', "/");
    let bytes = engine
        .decode(url_safe)
        .map_err(|_| ConfigError::new("Base64 decode failed"))?;
    String::from_utf8(bytes).map_err(|_| ConfigError::new("Base64 decode failed: invalid UTF-8"))
}

fn safe_base64_decode(input: &str) -> String {
    decode_base64(input).unwrap_or_else(|_| input.to_string())
}

fn parse_proxy_list(text: &str) -> Vec<ProxyNode> {
    let mut nodes: Vec<ProxyNode> = text.lines()
        .filter_map(|line| parse_line(line.trim()))
        .collect();

    // Generate unique tags for nodes with duplicate names
    ensure_unique_tags(&mut nodes);

    nodes
}

/// Ensure all nodes have unique tags by appending indices to duplicates.
fn ensure_unique_tags(nodes: &mut [ProxyNode]) {
    use std::collections::HashMap;

    // Count occurrences of each tag
    let mut tag_counts: HashMap<String, usize> = HashMap::new();
    for node in nodes.iter() {
        *tag_counts.entry(node.tag.clone()).or_insert(0) += 1;
    }

    // Track current index for each duplicate tag
    let mut tag_indices: HashMap<String, usize> = HashMap::new();

    for node in nodes.iter_mut() {
        let count = tag_counts.get(&node.tag).copied().unwrap_or(1);
        if count > 1 {
            // This tag appears multiple times, append index
            let idx = tag_indices.entry(node.tag.clone()).or_insert(0);
            *idx += 1;
            node.tag = format!("{}#{}", node.tag, idx);
        }
    }
}

fn parse_line(line: &str) -> Option<ProxyNode> {
    if line.is_empty() {
        return None;
    }

    let parsers: &[(&str, fn(&str) -> Option<ProxyNode>)] = &[
        ("ss://", parse_shadowsocks),
        ("vmess://", parse_vmess),
        ("trojan://", parse_trojan),
        ("vless://", parse_vless),
        ("hysteria2://", parse_hysteria2),
        ("hy2://", parse_hysteria2),
    ];

    for (prefix, parser) in parsers {
        if line.starts_with(prefix) {
            return parser(line);
        }
    }
    None
}

fn decode_uri_component(input: &str) -> String {
    urlencoding::decode(input)
        .map(|cow| cow.into_owned())
        .unwrap_or_else(|_| input.to_string())
}

fn normalize_network(raw: &str) -> String {
    let net = raw.to_lowercase();
    match net.as_str() {
        "" | "raw" => "tcp".into(),
        "websocket" => "ws".into(),
        "splithttp" => "xhttp".into(),
        other => other.to_string(),
    }
}

fn parse_query_params(query: &str) -> HashMap<String, String> {
    query
        .split('&')
        .filter_map(|pair| {
            let (key, value) = pair.split_once('=')?;
            Some((key.to_string(), decode_uri_component(value)))
        })
        .collect()
}

fn get_param<'a>(params: &'a HashMap<String, String>, key: &str) -> Option<&'a str> {
    params.get(key).map(String::as_str)
}

fn parse_alpn_list(alpn: Option<&str>) -> Option<Vec<String>> {
    let raw = alpn?;
    let list: Vec<String> = raw
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .collect();
    if list.is_empty() {
        None
    } else {
        Some(list)
    }
}

fn parse_fragment_param(raw: Option<&str>) -> Option<FragmentSpec> {
    let raw = raw?;
    let parts: Vec<&str> = raw.split(',').map(str::trim).filter(|s| !s.is_empty()).collect();
    match parts.len() {
        3 => {
            let packets = parts[0];
            let length = parts[1];
            let interval = parts[2];
            if length.is_empty() {
                return None;
            }
            Some(FragmentSpec {
                packets: if packets.is_empty() {
                    "tlshello".into()
                } else {
                    packets.to_string()
                },
                length: length.to_string(),
                interval: if interval.is_empty() {
                    length.to_string()
                } else {
                    interval.to_string()
                },
            })
        }
        4 if parts[0] == "0" || parts[0] == "1" => {
            if parts[0] == "0" {
                return None;
            }
            let length = parts[1];
            let interval = parts[2];
            let packets = parts[3];
            if length.is_empty() {
                return None;
            }
            Some(FragmentSpec {
                packets: if packets.is_empty() {
                    "tlshello".into()
                } else {
                    packets.to_string()
                },
                length: length.to_string(),
                interval: if interval.is_empty() {
                    length.to_string()
                } else {
                    interval.to_string()
                },
            })
        }
        _ => None,
    }
}

fn apply_transport_from_params(node: &mut ProxyNode, params: &HashMap<String, String>) {
    let net = normalize_network(
        get_param(params, "type")
            .or_else(|| get_param(params, "network"))
            .unwrap_or("tcp"),
    );
    node.network = net.clone();

    match net.as_str() {
        "ws" => {
            node.path = Some(get_param(params, "path").unwrap_or("/").to_string());
            node.host = get_param(params, "host").map(str::to_string);
        }
        "grpc" => {
            node.grpc_service_name = Some(
                get_param(params, "serviceName")
                    .or_else(|| get_param(params, "path"))
                    .unwrap_or("")
                    .to_string(),
            );
        }
        "httpupgrade" | "xhttp" => {
            node.path = Some(get_param(params, "path").unwrap_or("/").to_string());
            node.host = get_param(params, "host").map(str::to_string);
        }
        _ => {}
    }

    let security = get_param(params, "security").unwrap_or("none");
    node.security = security.to_string();

    if security == "tls" || security == "reality" {
        let sni = get_param(params, "sni")
            .or_else(|| get_param(params, "host"))
            .unwrap_or(&node.server);
        node.sni = Some(sni.to_string());
        node.fingerprint = get_param(params, "fp").map(str::to_string);
        node.alpn = parse_alpn_list(get_param(params, "alpn"));
        node.allow_insecure = get_param(params, "allowInsecure") == Some("1")
            || get_param(params, "insecure") == Some("1");

        if security == "reality" {
            node.reality_public_key = get_param(params, "pbk").map(str::to_string);
            node.reality_short_id = get_param(params, "sid").map(str::to_string);
            node.reality_spider_x = get_param(params, "spx").map(str::to_string);
        }
    }
}

fn parse_host_port(host_port: &str, default_port: u16) -> (String, u16) {
    let host_port = host_port.replace(['[', ']'], "");
    if let Some(ci) = host_port.rfind(':') {
        let host = host_port[..ci].to_string();
        let port = host_port[ci + 1..].parse().unwrap_or(default_port);
        (host, port)
    } else {
        (host_port, default_port)
    }
}

fn parse_vless(uri: &str) -> Option<ProxyNode> {
    let rest = &uri[8..];
    let (name, base) = match rest.rfind('#') {
        Some(i) => (
            decode_uri_component(&rest[i + 1..]),
            &rest[..i],
        ),
        None => ("VLESS Node".into(), rest),
    };

    let at_idx = base.rfind('@')?;
    let uuid = base[..at_idx].to_string();
    let host_query = &base[at_idx + 1..];

    let (host_port, query) = match host_query.split_once('?') {
        Some((hp, q)) => (hp, q),
        None => (host_query, ""),
    };

    let (server, port) = parse_host_port(host_port, 443);
    let params = parse_query_params(query);

    let mut node = ProxyNode::new(name.clone(), "vless", server, port);
    node.name = name;
    node.uuid = Some(uuid);
    node.encryption = Some(
        get_param(&params, "encryption")
            .unwrap_or("none")
            .to_string(),
    );
    node.flow = get_param(&params, "flow").map(str::to_string);
    apply_transport_from_params(&mut node, &params);
    node.fragment = parse_fragment_param(get_param(&params, "fragment"));
    Some(node)
}

fn parse_trojan(uri: &str) -> Option<ProxyNode> {
    let rest = &uri[9..];
    let hash_idx = rest.rfind('#');
    let (name, base) = match hash_idx {
        Some(i) => (
            decode_uri_component(&rest[i + 1..]),
            &rest[..i],
        ),
        None => ("Trojan Node".into(), rest),
    };

    let at_idx = base.rfind('@')?;
    let password = decode_uri_component(&base[..at_idx]);
    let host_query = &base[at_idx + 1..];

    let (host_port, query) = match host_query.split_once('?') {
        Some((hp, q)) => (hp, q),
        None => (host_query, ""),
    };

    let (server, port) = parse_host_port(host_port, 443);
    let mut params = parse_query_params(query);
    if !params.contains_key("security") {
        params.insert("security".into(), "tls".into());
    }

    let mut node = ProxyNode::new(name.clone(), "trojan", server, port);
    node.name = name;
    node.password = Some(password);
    apply_transport_from_params(&mut node, &params);
    node.fragment = parse_fragment_param(get_param(&params, "fragment"));
    Some(node)
}

fn parse_shadowsocks(uri: &str) -> Option<ProxyNode> {
    let rest = &uri[5..];
    let hash_idx = rest.rfind('#');
    let (name, base) = match hash_idx {
        Some(i) => (
            decode_uri_component(&rest[i + 1..]),
            &rest[..i],
        ),
        None => ("SS Node".into(), rest),
    };

    let (method, password, server, port) = if let Some(at_idx) = base.rfind('@') {
        let userinfo = safe_base64_decode(&base[..at_idx]);
        let (method, password) = split_userinfo(&userinfo)?;
        let (server, port) = parse_host_port(&base[at_idx + 1..], 8388);
        (method, password, server, port)
    } else {
        let decoded = safe_base64_decode(base);
        let at = decoded.rfind('@')?;
        let userinfo = &decoded[..at];
        let (method, password) = split_userinfo(userinfo)?;
        let (server, port) = parse_host_port(&decoded[at + 1..], 8388);
        (method, password, server, port)
    };

    if server.is_empty() || method.is_empty() {
        return None;
    }

    let mut node = ProxyNode::new(name.clone(), "shadowsocks", server, port);
    node.name = name;
    node.method = Some(method);
    node.password = Some(password);
    Some(node)
}

fn split_userinfo(userinfo: &str) -> Option<(String, String)> {
    let colon_idx = userinfo.find(':')?;
    Some((
        userinfo[..colon_idx].to_string(),
        userinfo[colon_idx + 1..].to_string(),
    ))
}

fn parse_vmess(uri: &str) -> Option<ProxyNode> {
    let rest = &uri[8..];
    let json = safe_base64_decode(rest);
    let cfg: serde_json::Value = serde_json::from_str(&json).ok()?;

    let tag = cfg
        .get("ps")
        .and_then(|v| v.as_str())
        .unwrap_or("VMess Node")
        .to_string();
    let server = cfg.get("add")?.as_str()?.to_string();
    let port = cfg
        .get("port")
        .and_then(|v| v.as_str().and_then(|s| s.parse().ok()).or_else(|| v.as_u64().map(|n| n as u16)))
        .unwrap_or(443);
    let uuid = cfg.get("id")?.as_str()?.to_string();

    let mut node = ProxyNode::new(tag.clone(), "vmess", server.clone(), port);
    node.name = tag;
    node.uuid = Some(uuid);
    node.encryption = Some(
        cfg.get("scy")
            .and_then(|v| v.as_str())
            .unwrap_or("auto")
            .to_string(),
    );

    let net = normalize_network(cfg.get("net").and_then(|v| v.as_str()).unwrap_or("tcp"));
    node.network = net.clone();
    match net.as_str() {
        "ws" => {
            node.path = Some(
                cfg.get("path")
                    .and_then(|v| v.as_str())
                    .unwrap_or("/")
                    .to_string(),
            );
            node.host = cfg.get("host").and_then(|v| v.as_str()).map(str::to_string);
        }
        "grpc" => {
            node.grpc_service_name = Some(
                cfg.get("path")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
            );
        }
        "httpupgrade" | "xhttp" => {
            node.path = Some(
                cfg.get("path")
                    .and_then(|v| v.as_str())
                    .unwrap_or("/")
                    .to_string(),
            );
            node.host = cfg.get("host").and_then(|v| v.as_str()).map(str::to_string);
        }
        _ => {}
    }

    if cfg.get("tls").and_then(|v| v.as_str()) == Some("tls") {
        node.security = "tls".into();
        let sni = cfg
            .get("sni")
            .or_else(|| cfg.get("host"))
            .and_then(|v| v.as_str())
            .unwrap_or(&server);
        node.sni = Some(sni.to_string());
        node.alpn = parse_alpn_list(cfg.get("alpn").and_then(|v| v.as_str()));
    }

    Some(node)
}

fn parse_hysteria2(uri: &str) -> Option<ProxyNode> {
    let prefix_len = if uri.starts_with("hy2://") { 6 } else { 12 };
    let rest = &uri[prefix_len..];
    let hash_idx = rest.rfind('#');
    let (name, base) = match hash_idx {
        Some(i) => (
            decode_uri_component(&rest[i + 1..]),
            &rest[..i],
        ),
        None => ("Hysteria2 Node".into(), rest),
    };

    let (password, host_query) = if let Some(at_idx) = base.rfind('@') {
        (
            decode_uri_component(&base[..at_idx]),
            &base[at_idx + 1..],
        )
    } else {
        (String::new(), base)
    };

    let (host_port, query) = match host_query.split_once('?') {
        Some((hp, q)) => (hp, q),
        None => (host_query, ""),
    };

    let (server, port) = parse_host_port(host_port, 443);
    let params = parse_query_params(query);
    let final_password = if password.is_empty() {
        get_param(&params, "auth").unwrap_or("").to_string()
    } else {
        password
    };

    if final_password.is_empty() || server.is_empty() {
        return None;
    }

    let mut node = ProxyNode::new(name.clone(), "hysteria2", server.clone(), port);
    node.name = name;
    node.password = Some(final_password);
    node.security = "tls".into();
    node.sni = Some(
        get_param(&params, "sni")
            .unwrap_or(&server)
            .to_string(),
    );
    node.allow_insecure = get_param(&params, "insecure") == Some("1")
        || get_param(&params, "allowInsecure") == Some("1");
    Some(node)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unrecognized_body() {
        let err = decode_subscription_body("not a proxy list").unwrap_err();
        assert!(err.to_string().contains("Cannot parse subscription"));
    }

    #[test]
    fn decodes_base64_uri_list() {
        let lines = [
            "vless://095909af-8903-4305-8a7d-07fd0fb8c0e3@162.159.38.162:443?security=tls&type=ws&host=example.com&path=%2F&encryption=none#node1",
            "vless://095909af-8903-4305-8a7d-07fd0fb8c0e3@172.64.53.121:443?security=tls&type=ws&host=example.com&path=%2F&encryption=none#node2",
        ]
        .join("\n");
        let body = base64::engine::general_purpose::STANDARD.encode(lines);
        let nodes = decode_subscription_body(&body).unwrap();
        assert_eq!(nodes.len(), 2);
        assert_eq!(nodes[0].tag, "node1");
        assert_eq!(nodes[1].tag, "node2");
    }

    #[test]
    fn vless_ws_tls_fields_are_engine_agnostic() {
        let body = "vless://095909af-8903-4305-8a7d-07fd0fb8c0e3@162.159.38.162:443?security=tls&sni=example.com&fp=random&type=ws&host=example.com&path=%2F%3Fed%3D2560&encryption=none#node1";
        let node = decode_subscription_body(body).unwrap().remove(0);
        assert_eq!(node.protocol, "vless");
        assert_eq!(node.network, "ws");
        assert_eq!(node.path.as_deref(), Some("/?ed=2560"));
        assert_eq!(node.host.as_deref(), Some("example.com"));
        assert_eq!(node.security, "tls");
        assert_eq!(node.sni.as_deref(), Some("example.com"));
        assert_eq!(node.fingerprint.as_deref(), Some("random"));
    }
}
