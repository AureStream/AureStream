//! TUN / system-proxy DNS policy shared across platforms.
//!
//! Intranet names are resolved inside Xray (`tcp+local://` or `localhost`).
//! Public resolvers (8.8.8.8, 114.114.114.114, …) must not stay as OS fallbacks
//! while TUN is up — they answer poisoned A records off-path.

use std::net::IpAddr;

use serde_json::{json, Value};

const INTRANET_TAG: &str = "dns-intranet";
const DEFAULT_INTRANET_DOMAINS: &[&str] = &[
    "geosite:private",
    "domain:lan",
    "domain:local",
    "domain:home.arpa",
];

/// RFC1918 / ULA unicast addresses that can be a LAN resolver.
pub fn is_intranet_dns_server(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v) => v.is_private(),
        IpAddr::V6(v) => (v.segments()[0] & 0xfe00) == 0xfc00,
    }
}

pub fn private_dns_servers(servers: &[String]) -> Vec<String> {
    servers
        .iter()
        .filter_map(|raw| parse_ip(raw))
        .filter(|ip| is_intranet_dns_server(*ip))
        .map(|ip| ip.to_string())
        .collect()
}

pub fn intranet_domain_rules(search_suffixes: &[String]) -> Vec<String> {
    let mut domains: Vec<String> = DEFAULT_INTRANET_DOMAINS
        .iter()
        .map(|s| (*s).to_string())
        .collect();
    for suffix in search_suffixes {
        if let Some(rule) = search_suffix_to_domain_rule(suffix) {
            if !domains.iter().any(|d| d == &rule) {
                domains.push(rule);
            }
        }
    }
    domains
}

/// Tokens after `resolvectl domain <iface>:` — skip `~.` catch-all.
pub fn parse_search_domains(raw: &str) -> Vec<String> {
    let payload = raw.rsplit_once(':').map(|(_, rest)| rest).unwrap_or(raw);
    payload
        .split_whitespace()
        .filter_map(|token| {
            let trimmed = token.trim_matches('.').trim_start_matches('~');
            if trimmed.is_empty() {
                None
            } else {
                search_suffix_to_domain_rule(trimmed).map(|_| trimmed.to_string())
            }
        })
        .collect()
}

pub fn search_suffix_to_domain_rule(suffix: &str) -> Option<String> {
    let s = suffix.trim().trim_start_matches('.').trim_end_matches('.');
    if s.is_empty() || s == "~" || s.contains('/') || s.contains(' ') {
        return None;
    }
    if !s
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.')
    {
        return None;
    }
    Some(format!("domain:{s}"))
}

pub fn intranet_dns_server_object(address: &str, search_suffixes: &[String]) -> Value {
    let mut obj = json!({
        "tag": INTRANET_TAG,
        "address": address,
        "domains": intranet_domain_rules(search_suffixes),
        "skipFallback": true,
        "timeoutMs": 1000
    });
    if address != "localhost" && !address.starts_with("tcp+local://") {
        // UDP/DoH intranet servers still participate in routing; pin private answers.
        obj["expectedIPs"] = json!(["geoip:private"]);
    }
    if address.starts_with("tcp+local://") {
        obj["expectedIPs"] = json!(["geoip:private"]);
    }
    obj
}

/// Insert/replace `dns-intranet` at the front of `dns.servers`.
/// Empty `private_servers` removes any previous intranet entry (TUN without LAN DNS).
pub fn inject_intranet_dns_servers(
    config: &mut Value,
    private_servers: &[String],
    search_suffixes: &[String],
) -> bool {
    let Some(servers) = config
        .pointer_mut("/dns/servers")
        .and_then(|v| v.as_array_mut())
    else {
        return false;
    };
    let before = servers.clone();
    servers.retain(|s| s.get("tag").and_then(|t| t.as_str()) != Some(INTRANET_TAG));
    if !private_servers.is_empty() {
        let mut inserted = Vec::new();
        for ip in private_servers {
            inserted.push(intranet_dns_server_object(
                &format!("tcp+local://{ip}"),
                search_suffixes,
            ));
        }
        for (i, obj) in inserted.into_iter().enumerate() {
            servers.insert(i, obj);
        }
    }
    servers.as_slice() != before.as_slice()
}

pub fn patch_tun_intranet_dns(
    config_path: &str,
    original_dns: &[String],
    search_suffixes: &[String],
) -> Result<bool, String> {
    let raw = std::fs::read_to_string(config_path)
        .map_err(|e| format!("read config {config_path}: {e}"))?;
    let mut v: Value =
        serde_json::from_str(&raw).map_err(|e| format!("parse config {config_path}: {e}"))?;
    let private = private_dns_servers(original_dns);
    if !inject_intranet_dns_servers(&mut v, &private, search_suffixes) {
        return Ok(false);
    }
    let out = serde_json::to_string_pretty(&v)
        .map_err(|e| format!("serialize config {config_path}: {e}"))?;
    std::fs::write(config_path, out).map_err(|e| format!("write config {config_path}: {e}"))?;
    Ok(true)
}

fn parse_ip(raw: &str) -> Option<IpAddr> {
    raw.split(['%', ' '])
        .next()
        .and_then(|s| s.trim().parse().ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn private_dns_servers_keeps_rfc1918_drops_public_and_loopback() {
        let got = private_dns_servers(&[
            "8.8.8.8".into(),
            "114.114.114.114".into(),
            "192.168.1.1".into(),
            "10.0.0.53".into(),
            "127.0.0.53".into(),
            "1.1.1.1".into(),
            "fd00::53".into(),
        ]);
        assert_eq!(got, vec!["192.168.1.1", "10.0.0.53", "fd00::53"]);
    }

    #[test]
    fn parse_search_domains_skips_catchall() {
        assert_eq!(
            parse_search_domains("Link 2 (ens160): lan corp.example"),
            vec!["lan", "corp.example"]
        );
        assert!(parse_search_domains("Link 2 (ens160): ~.").is_empty());
    }

    #[test]
    fn search_suffix_to_domain_rule_rejects_catchall_and_junk() {
        assert_eq!(
            search_suffix_to_domain_rule("corp.example"),
            Some("domain:corp.example".into())
        );
        assert_eq!(search_suffix_to_domain_rule("~."), None);
        assert_eq!(search_suffix_to_domain_rule("."), None);
        assert_eq!(search_suffix_to_domain_rule(""), None);
    }

    #[test]
    fn inject_prepends_tcp_local_intranet_and_strips_localhost_stub() {
        let mut cfg = json!({
            "dns": {
                "servers": [
                    {
                        "tag": "dns-intranet",
                        "address": "localhost",
                        "domains": ["geosite:private"],
                        "skipFallback": true
                    },
                    {
                        "tag": "dns-direct",
                        "address": "119.29.29.29",
                        "domains": ["geosite:cn"]
                    },
                    { "address": "https://cloudflare-dns.com/dns-query" }
                ]
            }
        });
        assert!(inject_intranet_dns_servers(
            &mut cfg,
            &["192.168.1.1".into()],
            &["corp.local".into()]
        ));
        let servers = cfg["dns"]["servers"].as_array().unwrap();
        assert_eq!(servers[0]["tag"], "dns-intranet");
        assert_eq!(servers[0]["address"], "tcp+local://192.168.1.1");
        assert_eq!(servers[0]["skipFallback"], true);
        assert_eq!(servers[0]["expectedIPs"][0], "geoip:private");
        let domains = servers[0]["domains"].as_array().unwrap();
        assert!(domains.iter().any(|d| d == "geosite:private"));
        assert!(domains.iter().any(|d| d == "domain:corp.local"));
        assert_eq!(servers[1]["address"], "119.29.29.29");
        assert_eq!(servers.len(), 3);
    }

    #[test]
    fn inject_without_private_dns_drops_intranet_stub() {
        let mut cfg = json!({
            "dns": {
                "servers": [
                    { "tag": "dns-intranet", "address": "localhost" },
                    { "address": "https://dns.google/dns-query" }
                ]
            }
        });
        assert!(inject_intranet_dns_servers(&mut cfg, &[], &[]));
        let servers = cfg["dns"]["servers"].as_array().unwrap();
        assert_eq!(servers.len(), 1);
        assert_eq!(servers[0]["address"], "https://dns.google/dns-query");
    }
}
