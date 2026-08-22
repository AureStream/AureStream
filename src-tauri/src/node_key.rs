//! Stable node identity — the one value the app remembers a node by.
//!
//! Display names are the *worst* possible key: providers routinely rebuild them
//! on every subscription refresh (live speed in the name, `电信-60.48mb/s`),
//! reorder the list, and translate labels. Anything that stored a tag — the
//! persisted selection, the latency cache, the UI's "which row is selected"
//! check — broke on the next sync and surfaced as `node_not_found`.
//!
//! The key here is derived from what actually identifies an endpoint
//! (protocol + host + port + credential), hashed so it can travel to the
//! frontend without carrying the credential with it.
//!
//! ## Evolving the format
//!
//! Keys are persisted, so a format change must never orphan an existing
//! selection. The rule: **add**, never replace. Give the new format a fresh
//! prefix, emit it from [`node_key`], and keep the old builder in
//! [`aliases`]. [`key_matches`] accepts any alias, so a key written by an
//! older version keeps resolving and gets rewritten to the current format on
//! the next save.

use aurestream_config::ProxyNode;

/// Current key format tag. Bump when the hashed inputs change — and move the
/// previous builder into [`aliases`] rather than deleting it.
const KEY_PREFIX: &str = "n2";

/// Stable, credential-free identity of a node. Safe to hand to the frontend.
pub fn node_key(node: &ProxyNode) -> String {
    format!("{KEY_PREFIX}:{:032x}", fnv1a_128(identity_input(node).as_bytes()))
}

/// Endpoint-only identity: survives a credential rotation on the same server.
/// Weaker than [`node_key`] (a provider can host several nodes per port), so
/// it is only ever used as a late fallback in resolution.
pub fn node_endpoint(node: &ProxyNode) -> String {
    format!("{}|{}|{}", node.protocol, node.server, node.port)
}

/// True when `stored` — a key persisted by *any* version — names this node.
pub fn key_matches(stored: &str, node: &ProxyNode) -> bool {
    !stored.is_empty() && aliases(node).iter().any(|alias| alias == stored)
}

/// Every key form this node has ever been addressable by, newest first.
fn aliases(node: &ProxyNode) -> Vec<String> {
    vec![node_key(node), identity_input(node)]
}

/// The v1 key (AureStream 1.0.1) — a plaintext tuple. Still accepted on read
/// so selections written by 1.0.1 survive the upgrade; never written anymore,
/// because it embeds the node credential.
fn identity_input(node: &ProxyNode) -> String {
    let secret = node
        .uuid
        .as_deref()
        .or(node.password.as_deref())
        .unwrap_or("");
    format!("{}|{}|{}|{}", node.protocol, node.server, node.port, secret)
}

/// FNV-1a, 128-bit. Chosen over a cryptographic digest to avoid pulling a hash
/// crate into the shell for what is only an identity label — collisions here
/// would merely pick the wrong node from one subscription, not a security
/// boundary.
fn fnv1a_128(bytes: &[u8]) -> u128 {
    const OFFSET_BASIS: u128 = 0x6c62_272e_07bb_0142_62b8_2175_6295_c58d;
    const PRIME: u128 = 0x0000_0000_0100_0000_0000_0000_0000_013b;
    let mut hash = OFFSET_BASIS;
    for byte in bytes {
        hash ^= *byte as u128;
        hash = hash.wrapping_mul(PRIME);
    }
    hash
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vless(tag: &str, server: &str, uuid: &str) -> ProxyNode {
        let mut node = ProxyNode::new(tag, "vless", server, 443);
        node.uuid = Some(uuid.into());
        node
    }

    #[test]
    fn key_ignores_display_name() {
        let before = vless("电信-60.48mb/s", "example.com", "uuid-1");
        let after = vless("电信-69.68mb/s", "example.com", "uuid-1");
        assert_eq!(node_key(&before), node_key(&after));
    }

    #[test]
    fn key_separates_distinct_endpoints() {
        let a = vless("同名", "a.example", "uuid-1");
        let b = vless("同名", "b.example", "uuid-1");
        let c = vless("同名", "a.example", "uuid-2");
        assert_ne!(node_key(&a), node_key(&b));
        assert_ne!(node_key(&a), node_key(&c));
    }

    #[test]
    fn key_carries_no_credential() {
        let node = vless("n", "example.com", "super-secret-uuid");
        assert!(!node_key(&node).contains("super-secret-uuid"));
    }

    /// The upgrade path that matters: 1.0.1 wrote the plaintext tuple into
    /// `engine-selection.json`. It must still resolve after this change.
    #[test]
    fn legacy_v1_key_still_matches() {
        let node = vless("电信-69.68mb/s", "example.com", "uuid-1");
        let v1 = "vless|example.com|443|uuid-1";
        assert!(key_matches(v1, &node));
        assert!(key_matches(&node_key(&node), &node));
        assert!(!key_matches("vless|example.com|443|other", &node));
        assert!(!key_matches("", &node));
    }
}
