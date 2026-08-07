//! Pure config.json rewrites used by TUN start paths (Windows / macOS / Linux).
//! Kept free of OS `cfg` so unit tests run on every host CI.
//!
//! Without binding proxy/direct dials to the physical NIC, Xray's own connection
//! to the node server is captured by TUN → loops back →
//! `websocket: failed to dial … io: read/write on closed pipe`, and Google/YouTube die.

use std::net::{IpAddr, ToSocketAddrs};

use ipnet::IpNet;

/// Rewrite `config.json` so TUN outbounds leave via the physical interface `iface`.
///
/// - TUN inbound: `autoOutboundsInterface` = iface (not `"auto"`)
/// - Every dialing outbound (proxy / freedom / …): `streamSettings.sockopt.interface`
/// - TUN routes: exclude every resolved proxy-server IP so the kernel can use
///   the original physical-interface default route for the proxy connection
///
/// Returns `Ok(true)` when the file was modified.
pub fn patch_tun_config_outbounds_interface(
    config_path: &str,
    iface: &str,
) -> Result<bool, String> {
    let iface = iface.trim();
    if iface.is_empty() {
        return Err("empty interface name".into());
    }

    let raw = std::fs::read_to_string(config_path)
        .map_err(|e| format!("read config {}: {}", config_path, e))?;
    let mut v: serde_json::Value =
        serde_json::from_str(&raw).map_err(|e| format!("parse config {}: {}", config_path, e))?;

    let mut changed = false;

    let (server, port) = first_proxy_server_endpoint(&v)
        .ok_or_else(|| "proxy server endpoint is missing from config".to_string())?;
    let server_ips = resolve_server_ips(&server, port)?;
    log::info!(
        "[tun] proxy endpoint bypass server={server}:{port} resolved={}",
        server_ips
            .iter()
            .map(ToString::to_string)
            .collect::<Vec<_>>()
            .join(",")
    );

    if let Some(inbounds) = v.get_mut("inbounds").and_then(|x| x.as_array_mut()) {
        for inb in inbounds.iter_mut() {
            if inb.get("protocol").and_then(|p| p.as_str()) != Some("tun") {
                continue;
            }
            let settings = inb
                .as_object_mut()
                .ok_or_else(|| "tun inbound is not an object".to_string())?
                .entry("settings")
                .or_insert_with(|| serde_json::json!({}));
            let obj = settings
                .as_object_mut()
                .ok_or_else(|| "tun settings is not an object".to_string())?;
            let prev = obj
                .get("autoOutboundsInterface")
                .and_then(|x| x.as_str())
                .unwrap_or("");
            if prev != iface {
                obj.insert(
                    "autoOutboundsInterface".into(),
                    serde_json::Value::String(iface.to_string()),
                );
                changed = true;
            }
            if exclude_ips_from_tun_routes(obj, &server_ips)? {
                changed = true;
            }
        }
    }

    // Bind every dialing outbound to the physical NIC. dns/blackhole need no interface.
    if let Some(outbounds) = v.get_mut("outbounds").and_then(|x| x.as_array_mut()) {
        for ob in outbounds.iter_mut() {
            let proto = ob.get("protocol").and_then(|p| p.as_str()).unwrap_or("");
            if matches!(proto, "dns" | "blackhole" | "dokodemo-door") {
                continue;
            }
            let obj = match ob.as_object_mut() {
                Some(o) => o,
                None => continue,
            };
            let stream = obj
                .entry("streamSettings")
                .or_insert_with(|| serde_json::json!({}));
            let stream_obj = match stream.as_object_mut() {
                Some(o) => o,
                None => continue,
            };
            let sockopt = stream_obj
                .entry("sockopt")
                .or_insert_with(|| serde_json::json!({}));
            let sockopt_obj = match sockopt.as_object_mut() {
                Some(o) => o,
                None => continue,
            };
            let prev = sockopt_obj
                .get("interface")
                .and_then(|x| x.as_str())
                .unwrap_or("");
            if prev != iface {
                sockopt_obj.insert(
                    "interface".into(),
                    serde_json::Value::String(iface.to_string()),
                );
                changed = true;
            }
        }
    }

    // Also force the proxy server endpoint itself to `direct` so any packet that
    // still enters TUN toward the node IP is not sent back into the proxy chain.
    if let Some(rules) = v
        .pointer_mut("/routing/rules")
        .and_then(|r| r.as_array_mut())
    {
        if ensure_server_direct_rule(rules, &server) {
            changed = true;
        }
        for ip in &server_ips {
            if ensure_server_direct_rule(rules, &ip.to_string()) {
                changed = true;
            }
        }
    }

    if changed {
        let out = serde_json::to_vec_pretty(&v).map_err(|e| format!("serialize config: {}", e))?;
        std::fs::write(config_path, out)
            .map_err(|e| format!("write config {}: {}", config_path, e))?;
    }
    Ok(changed)
}

fn first_proxy_server_endpoint(cfg: &serde_json::Value) -> Option<(String, u16)> {
    let outs = cfg.get("outbounds")?.as_array()?;
    for ob in outs {
        let proto = ob.get("protocol").and_then(|p| p.as_str()).unwrap_or("");
        if !matches!(
            proto,
            "vless" | "vmess" | "trojan" | "shadowsocks" | "hysteria" | "hysteria2" | "wireguard"
        ) {
            continue;
        }
        let settings = ob.get("settings")?;
        if let Some(vnext) = settings.get("vnext").and_then(|x| x.as_array()) {
            if let Some(addr) = vnext
                .first()
                .and_then(|s| s.get("address"))
                .and_then(|a| a.as_str())
            {
                let port = vnext
                    .first()
                    .and_then(|s| s.get("port"))
                    .and_then(|p| p.as_u64())
                    .and_then(|p| u16::try_from(p).ok())
                    .unwrap_or(443);
                return Some((addr.to_string(), port));
            }
        }
        if let Some(servers) = settings.get("servers").and_then(|x| x.as_array()) {
            if let Some(addr) = servers.first().and_then(|s| {
                s.get("address")
                    .or_else(|| s.get("addr"))
                    .and_then(|a| a.as_str())
            }) {
                let port = servers
                    .first()
                    .and_then(|s| s.get("port"))
                    .and_then(|p| p.as_u64())
                    .and_then(|p| u16::try_from(p).ok())
                    .unwrap_or(443);
                return Some((addr.to_string(), port));
            }
        }
    }
    None
}

fn resolve_server_ips(server: &str, port: u16) -> Result<Vec<IpAddr>, String> {
    if let Ok(ip) = server.parse::<IpAddr>() {
        return Ok(vec![ip]);
    }

    let mut ips: Vec<IpAddr> = (server, port)
        .to_socket_addrs()
        .map_err(|e| format!("resolve proxy server {server}:{port}: {e}"))?
        .map(|addr| addr.ip())
        .collect();
    ips.sort_unstable();
    ips.dedup();
    if ips.is_empty() {
        return Err(format!(
            "resolve proxy server {server}:{port}: no IP addresses"
        ));
    }
    Ok(ips)
}

fn exclude_ips_from_tun_routes(
    tun_settings: &mut serde_json::Map<String, serde_json::Value>,
    excluded_ips: &[IpAddr],
) -> Result<bool, String> {
    let Some(routes) = tun_settings
        .get_mut("autoSystemRoutingTable")
        .and_then(|value| value.as_array_mut())
    else {
        return Err("tun autoSystemRoutingTable is missing".into());
    };

    let original = routes.clone();
    let mut networks = Vec::with_capacity(routes.len());
    for route in routes.iter() {
        let route = route
            .as_str()
            .ok_or_else(|| "tun autoSystemRoutingTable contains a non-string route".to_string())?;
        networks.push(
            route
                .parse::<IpNet>()
                .map_err(|e| format!("invalid TUN route CIDR {route}: {e}"))?,
        );
    }

    for excluded in excluded_ips {
        networks = networks
            .into_iter()
            .flat_map(|network| exclude_ip_from_network(network, *excluded))
            .collect();
    }

    *routes = networks
        .into_iter()
        .map(|network| serde_json::Value::String(network.to_string()))
        .collect();
    Ok(*routes != original)
}

fn exclude_ip_from_network(network: IpNet, address: IpAddr) -> Vec<IpNet> {
    if !network.contains(&address) {
        return vec![network];
    }
    if network.prefix_len() == network.max_prefix_len() {
        return Vec::new();
    }

    let mut children = network
        .subnets(network.prefix_len() + 1)
        .expect("one-bit CIDR split is always valid");
    let first = children.next().expect("CIDR split returns two children");
    let second = children.next().expect("CIDR split returns two children");
    let (containing, sibling) = if first.contains(&address) {
        (first, second)
    } else {
        (second, first)
    };
    let mut result = exclude_ip_from_network(containing, address);
    result.push(sibling);
    result
}

fn ensure_server_direct_rule(rules: &mut Vec<serde_json::Value>, server: &str) -> bool {
    let server = server.trim();
    if server.is_empty() {
        return false;
    }
    let is_ip = server.parse::<std::net::IpAddr>().is_ok();
    // Already present?
    for r in rules.iter() {
        if r.get("outboundTag").and_then(|t| t.as_str()) != Some("direct") {
            continue;
        }
        if is_ip {
            if let Some(ips) = r.get("ip").and_then(|x| x.as_array()) {
                if ips.iter().any(|x| x.as_str() == Some(server)) {
                    return false;
                }
            }
        } else if let Some(domains) = r.get("domain").and_then(|x| x.as_array()) {
            let full = format!("full:{server}");
            if domains
                .iter()
                .any(|x| x.as_str() == Some(server) || x.as_str() == Some(full.as_str()))
            {
                return false;
            }
        }
    }

    let rule = if is_ip {
        serde_json::json!({
            "type": "field",
            "ip": [server],
            "outboundTag": "direct"
        })
    } else {
        serde_json::json!({
            "type": "field",
            "domain": [format!("full:{server}")],
            "outboundTag": "direct"
        })
    };
    // Insert near the front (after api/dns tags if any) so it wins before catch-all proxy.
    let insert_at = rules
        .iter()
        .position(|r| {
            r.get("network").is_some()
                || r.get("domain")
                    .and_then(|d| d.as_array())
                    .is_some_and(|a| a.iter().any(|x| x.as_str() == Some("geosite:cn")))
                || r.get("ip")
                    .and_then(|d| d.as_array())
                    .is_some_and(|a| a.iter().any(|x| x.as_str() == Some("geoip:cn")))
        })
        .unwrap_or(rules.len());
    rules.insert(insert_at.min(rules.len()), rule);
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn patch_sets_auto_outbounds_and_all_dial_sockopt_plus_server_direct() {
        let dir = std::env::temp_dir().join(format!(
            "aurestream-outbound-if-test-{}",
            std::process::id()
        ));
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join("config.json");
        let cfg = serde_json::json!({
            "inbounds": [{
                "protocol": "tun",
                "settings": {
                    "autoOutboundsInterface": "auto",
                    "autoSystemRoutingTable": ["0.0.0.0/0"],
                    "gateway": ["198.18.0.1/30"]
                }
            }],
            "outbounds": [
                {
                    "tag": "proxy",
                    "protocol": "vless",
                    "settings": { "vnext": [{ "address": "1.2.3.4", "port": 443 }] }
                },
                { "tag": "direct", "protocol": "freedom", "settings": {} },
                { "tag": "block", "protocol": "blackhole" }
            ],
            "routing": {
                "rules": [
                    { "type": "field", "network": "tcp,udp", "outboundTag": "proxy" }
                ]
            }
        });
        {
            let mut f = std::fs::File::create(&path).unwrap();
            f.write_all(cfg.to_string().as_bytes()).unwrap();
        }

        let changed = patch_tun_config_outbounds_interface(path.to_str().unwrap(), "en0").unwrap();
        assert!(changed);

        let parsed: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(
            parsed["inbounds"][0]["settings"]["autoOutboundsInterface"],
            "en0"
        );
        assert_eq!(
            parsed["outbounds"][0]["streamSettings"]["sockopt"]["interface"],
            "en0"
        );
        assert_eq!(
            parsed["outbounds"][1]["streamSettings"]["sockopt"]["interface"],
            "en0"
        );
        assert!(parsed["outbounds"][2].get("streamSettings").is_none());

        let tun_routes = parsed["inbounds"][0]["settings"]["autoSystemRoutingTable"]
            .as_array()
            .unwrap();
        assert!(
            !routes_contain(tun_routes, "1.2.3.4".parse().unwrap()),
            "proxy server must bypass every TUN route: {tun_routes:?}"
        );
        assert!(
            routes_contain(tun_routes, "1.2.3.5".parse().unwrap()),
            "neighboring Internet addresses must remain captured: {tun_routes:?}"
        );
        assert!(
            routes_contain(tun_routes, "8.8.8.8".parse().unwrap()),
            "unrelated Internet addresses must remain captured: {tun_routes:?}"
        );

        let rules = parsed["routing"]["rules"].as_array().unwrap();
        assert!(
            rules.iter().any(|r| {
                r.get("outboundTag").and_then(|t| t.as_str()) == Some("direct")
                    && r.get("ip")
                        .and_then(|a| a.as_array())
                        .is_some_and(|a| a.iter().any(|x| x.as_str() == Some("1.2.3.4")))
            }),
            "server IP must be forced direct: {rules:?}"
        );

        let changed2 = patch_tun_config_outbounds_interface(path.to_str().unwrap(), "en0").unwrap();
        assert!(!changed2);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn cidr_exclusion_is_exact_for_ipv4_and_ipv6() {
        let ipv4 = "0.0.0.0/0".parse::<IpNet>().unwrap();
        let ipv4_routes = exclude_ip_from_network(ipv4, "173.245.58.61".parse().unwrap());
        assert!(!ipv4_routes
            .iter()
            .any(|route| route.contains(&"173.245.58.61".parse::<IpAddr>().unwrap())));
        assert!(ipv4_routes
            .iter()
            .any(|route| route.contains(&"173.245.58.60".parse::<IpAddr>().unwrap())));
        assert!(ipv4_routes
            .iter()
            .any(|route| route.contains(&"173.245.58.62".parse::<IpAddr>().unwrap())));

        let ipv6 = "::/0".parse::<IpNet>().unwrap();
        let ipv6_routes = exclude_ip_from_network(ipv6, "2606:4700:4700::1111".parse().unwrap());
        assert!(!ipv6_routes
            .iter()
            .any(|route| route.contains(&"2606:4700:4700::1111".parse::<IpAddr>().unwrap())));
        assert!(ipv6_routes
            .iter()
            .any(|route| route.contains(&"2606:4700:4700::1112".parse::<IpAddr>().unwrap())));
    }

    #[test]
    fn domain_endpoint_resolves_before_tun_routes_are_patched() {
        let resolved = resolve_server_ips("localhost", 443).unwrap();
        assert!(!resolved.is_empty());

        let mut settings = serde_json::json!({
            "autoSystemRoutingTable": ["0.0.0.0/0", "::/0"]
        })
        .as_object()
        .unwrap()
        .clone();
        assert!(exclude_ips_from_tun_routes(&mut settings, &resolved).unwrap());
        let routes = settings["autoSystemRoutingTable"].as_array().unwrap();
        for address in resolved {
            assert!(
                !routes_contain(routes, address),
                "resolved proxy address {address} must bypass TUN: {routes:?}"
            );
        }
    }

    fn routes_contain(routes: &[serde_json::Value], address: IpAddr) -> bool {
        routes.iter().any(|route| {
            route
                .as_str()
                .and_then(|route| route.parse::<IpNet>().ok())
                .is_some_and(|route| route.contains(&address))
        })
    }
}
