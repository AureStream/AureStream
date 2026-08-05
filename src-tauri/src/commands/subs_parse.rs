//! Coarse subscription-body → NodeInfo extraction (full ProxyNode decode is Task 6).

use crate::state::NodeInfo;

const KNOWN_SCHEMES: &[&str] = &[
    "ss",
    "vmess",
    "vless",
    "trojan",
    "hysteria2",
    "hy2",
    "tuic",
    "wireguard",
];

/// Extract coarse `{ tag, name, protocol }` entries from a subscription body.
///
/// Accepts plain URI lists or common base64-wrapped URI lists. Names come from
/// the URI fragment (`#name`) when present; otherwise a placeholder is used.
pub fn extract_nodes_from_body(body: &str) -> Vec<NodeInfo> {
    let text = normalize_body(body);
    let mut nodes = Vec::new();
    let mut index = 0usize;

    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Some(node) = parse_uri_line(line, index) {
            nodes.push(node);
            index += 1;
        }
    }

    nodes
}

fn normalize_body(body: &str) -> String {
    let trimmed = body.trim();
    if looks_like_uri_list(trimmed) {
        return trimmed.to_string();
    }

    let compact: String = trimmed.chars().filter(|c| !c.is_whitespace()).collect();
    if let Some(decoded) = try_base64_utf8(&compact) {
        if looks_like_uri_list(&decoded) || decoded.contains("://") {
            return decoded;
        }
    }

    trimmed.to_string()
}

fn looks_like_uri_list(text: &str) -> bool {
    text.lines().any(|line| {
        let line = line.trim();
        KNOWN_SCHEMES
            .iter()
            .any(|scheme| line.starts_with(&format!("{scheme}://")))
    })
}

fn try_base64_utf8(input: &str) -> Option<String> {
    use base64::Engine;

    let engines = [
        base64::engine::general_purpose::STANDARD,
        base64::engine::general_purpose::STANDARD_NO_PAD,
        base64::engine::general_purpose::URL_SAFE,
        base64::engine::general_purpose::URL_SAFE_NO_PAD,
    ];

    for engine in engines {
        if let Ok(bytes) = engine.decode(input) {
            if let Ok(text) = String::from_utf8(bytes) {
                return Some(text);
            }
        }
    }
    None
}

fn parse_uri_line(line: &str, index: usize) -> Option<NodeInfo> {
    let scheme_end = line.find("://")?;
    let scheme = &line[..scheme_end];
    if !KNOWN_SCHEMES.contains(&scheme) {
        return None;
    }

    let protocol = normalize_protocol(scheme);
    let name = line
        .rsplit_once('#')
        .map(|(_, frag)| percent_decode(frag))
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| format!("节点 {}", index + 1));

    let tag = sanitize_tag(&name, index);

    Some(NodeInfo {
        tag,
        name,
        protocol,
    })
}

fn normalize_protocol(scheme: &str) -> String {
    match scheme {
        "hy2" => "hysteria2".to_string(),
        "ss" => "shadowsocks".to_string(),
        other => other.to_string(),
    }
}

fn sanitize_tag(name: &str, index: usize) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect();
    let cleaned = cleaned.trim_matches('-');
    if cleaned.is_empty() {
        format!("node-{index}")
    } else {
        cleaned.to_string()
    }
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(hi), Some(lo)) = (from_hex(bytes[i + 1]), from_hex(bytes[i + 2])) {
                out.push((hi << 4) | lo);
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

fn from_hex(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine;

    #[test]
    fn extracts_name_protocol_from_plain_uri_list() {
        let body = "\
vless://abcd@example.com:443?encryption=none#HK-1
trojan://secret@example.com:443#JP%20Node
ss://YWVzLTI1Ni1nY206cGFzcw@example.com:8388
";
        let nodes = extract_nodes_from_body(body);
        assert_eq!(nodes.len(), 3);
        assert_eq!(nodes[0].protocol, "vless");
        assert_eq!(nodes[0].name, "HK-1");
        assert_eq!(nodes[1].protocol, "trojan");
        assert_eq!(nodes[1].name, "JP Node");
        assert_eq!(nodes[2].protocol, "shadowsocks");
        assert_eq!(nodes[2].name, "节点 3");
    }

    #[test]
    fn extracts_from_base64_wrapped_uri_list() {
        let plain = "vmess://eyJ2IjoiMiJ9#US-1\nvless://x@h:1#EU-2\n";
        let encoded = base64::engine::general_purpose::STANDARD.encode(plain.as_bytes());
        let nodes = extract_nodes_from_body(&encoded);
        assert_eq!(nodes.len(), 2);
        assert_eq!(nodes[0].protocol, "vmess");
        assert_eq!(nodes[0].name, "US-1");
        assert_eq!(nodes[1].name, "EU-2");
    }

    #[test]
    fn ignores_non_proxy_lines() {
        let body = "not a proxy\n# comment\nvless://x@h:1#ok\n";
        let nodes = extract_nodes_from_body(body);
        assert_eq!(nodes.len(), 1);
        assert_eq!(nodes[0].name, "ok");
    }
}
