//! Pure config.json rewrites used by TUN start paths (Windows / macOS / Linux).
//! Kept free of OS `cfg` so unit tests run on every host CI.
//!
//! Without binding proxy/direct dials to the physical NIC, Xray's own connection
//! to the node server is captured by TUN → loops back →
//! `websocket: failed to dial … io: read/write on closed pipe`, and Google/YouTube die.

/// Rewrite `config.json` so TUN outbounds leave via the physical interface `iface`.
///
/// - TUN inbound: `autoOutboundsInterface` = iface (not `"auto"`)
/// - Every dialing outbound (proxy / freedom / …): `streamSettings.sockopt.interface`
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
    let mut v: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|e| format!("parse config {}: {}", config_path, e))?;

    let mut changed = false;

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
    if let Some(server) = first_proxy_server_address(&v) {
        if let Some(rules) = v
            .pointer_mut("/routing/rules")
            .and_then(|r| r.as_array_mut())
        {
            if ensure_server_direct_rule(rules, &server) {
                changed = true;
            }
        }
    }

    if changed {
        let out =
            serde_json::to_vec_pretty(&v).map_err(|e| format!("serialize config: {}", e))?;
        std::fs::write(config_path, out)
            .map_err(|e| format!("write config {}: {}", config_path, e))?;
    }
    Ok(changed)
}

fn first_proxy_server_address(cfg: &serde_json::Value) -> Option<String> {
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
                return Some(addr.to_string());
            }
        }
        if let Some(servers) = settings.get("servers").and_then(|x| x.as_array()) {
            if let Some(addr) = servers.first().and_then(|s| {
                s.get("address")
                    .or_else(|| s.get("addr"))
                    .and_then(|a| a.as_str())
            }) {
                return Some(addr.to_string());
            }
        }
    }
    None
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

        let changed =
            patch_tun_config_outbounds_interface(path.to_str().unwrap(), "en0").unwrap();
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

        let changed2 =
            patch_tun_config_outbounds_interface(path.to_str().unwrap(), "en0").unwrap();
        assert!(!changed2);

        let _ = std::fs::remove_dir_all(&dir);
    }
}
