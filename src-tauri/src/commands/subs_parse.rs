//! Subscription-body → NodeInfo via `aurestream-config` decode (engine-agnostic tags).

use aurestream_config::decode_subscription_body;

use crate::node_key::node_key;
use crate::state::NodeInfo;

/// Extract `{ id, tag, name, protocol, server, port }` using the same decode
/// path as engine start.
///
/// `id` is the stable identity the UI selects by. It is computed here — from
/// the same `ProxyNode` the engine will later start — so an id the user taps
/// is always resolvable by the engine.
///
/// Falls back to an empty list when the body is not a recognized URI list
/// (Clash YAML / pre-shaped JSON are out of MVP decode scope).
pub fn extract_nodes_from_body(body: &str) -> Vec<NodeInfo> {
    match decode_subscription_body(body) {
        Ok(nodes) => nodes
            .into_iter()
            .map(|n| NodeInfo {
                id: node_key(&n),
                tag: n.tag,
                name: n.name,
                protocol: n.protocol,
                server: n.server,
                port: n.port,
            })
            .collect(),
        Err(_) => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_name_protocol_from_plain_uri_list() {
        let body = "\
vless://abcd@example.com:443?encryption=none#HK-1
trojan://secret@example.com:443#JP%20Node
";
        let nodes = extract_nodes_from_body(body);
        assert_eq!(nodes.len(), 2);
        assert_eq!(nodes[0].protocol, "vless");
        assert_eq!(nodes[0].tag, "HK-1");
        assert_eq!(nodes[0].name, "HK-1");
        assert_eq!(nodes[0].server, "example.com");
        assert_eq!(nodes[0].port, 443);
        assert_eq!(nodes[1].protocol, "trojan");
        assert_eq!(nodes[1].tag, "JP Node");
        assert_eq!(nodes[1].name, "JP Node");
        assert_eq!(nodes[1].server, "example.com");
        assert_eq!(nodes[1].port, 443);
    }

    /// The whole point of `id`: it must not move when the provider rewrites
    /// display names (live speed in the name) on the next sync.
    #[test]
    fn node_id_is_stable_across_renames() {
        let before = extract_nodes_from_body("vless://u@example.com:443#%E7%94%B5%E4%BF%A1-60.48mb%2Fs");
        let after = extract_nodes_from_body("vless://u@example.com:443#%E7%94%B5%E4%BF%A1-69.68mb%2Fs");
        assert_eq!(before.len(), 1);
        assert_ne!(before[0].tag, after[0].tag);
        assert_eq!(before[0].id, after[0].id);
        assert!(!before[0].id.is_empty());
    }

    #[test]
    fn extracts_from_base64_wrapped_uri_list() {
        use base64::Engine;
        let vmess_json = r#"{"v":"2","ps":"US-1","add":"h1","port":"443","id":"abcd"}"#;
        let vmess_b64 = base64::engine::general_purpose::STANDARD.encode(vmess_json.as_bytes());
        let plain = format!("vmess://{vmess_b64}\nvless://x@h:1#EU-2\n");
        let encoded = base64::engine::general_purpose::STANDARD.encode(plain.as_bytes());
        let nodes = extract_nodes_from_body(&encoded);
        assert_eq!(nodes.len(), 2);
        assert_eq!(nodes[0].protocol, "vmess");
        assert_eq!(nodes[0].tag, "US-1");
        assert_eq!(nodes[1].tag, "EU-2");
    }

    #[test]
    fn ignores_non_proxy_lines() {
        let body = "not a proxy\n# comment\nvless://x@h:1#ok\n";
        let nodes = extract_nodes_from_body(body);
        assert_eq!(nodes.len(), 1);
        assert_eq!(nodes[0].name, "ok");
        assert_eq!(nodes[0].tag, "ok");
    }
}
