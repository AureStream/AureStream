use std::fs;

use aurestream_config::ProxyNode;
use aurestream_engine::{Engine, XrayEngine};
use serde_json::Value;

fn sample_vless_node() -> ProxyNode {
    let mut node = ProxyNode::new("node1", "vless", "162.159.38.162", 443);
    node.uuid = Some("095909af-8903-4305-8a7d-07fd0fb8c0e3".into());
    node.encryption = Some("none".into());
    node.network = "ws".into();
    node.path = Some("/".into());
    node.host = Some("example.com".into());
    node.security = "tls".into();
    node.sni = Some("example.com".into());
    node
}

#[test]
fn xray_build_config_single_outbound_no_tun() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.json");
    let engine = XrayEngine::new();
    engine
        .build_config(&path, &sample_vless_node(), 17890, 17891)
        .expect("build_config");

    let raw = fs::read_to_string(&path).expect("read config");
    let cfg: Value = serde_json::from_str(&raw).expect("parse json");

    let inbounds = cfg["inbounds"].as_array().expect("inbounds array");
    assert!(
        !inbounds
            .iter()
            .any(|ib| ib.get("protocol").and_then(|p| p.as_str()) == Some("tun")),
        "must not include tun inbound"
    );

    let socks = inbounds.iter().find(|ib| {
        matches!(
            ib.get("protocol").and_then(|p| p.as_str()),
            Some("socks") | Some("mixed")
        )
    });
    let socks = socks.expect("socks/mixed inbound");
    assert_eq!(socks["listen"], "127.0.0.1");
    assert_eq!(socks["port"], 17890);

    let outbounds = cfg["outbounds"].as_array().expect("outbounds array");
    let proxy_protocols = [
        "vless",
        "vmess",
        "trojan",
        "shadowsocks",
        "hysteria2",
        "hysteria",
        "wireguard",
    ];
    let proxy_count = outbounds
        .iter()
        .filter(|o| {
            o.get("protocol")
                .and_then(|p| p.as_str())
                .is_some_and(|p| proxy_protocols.contains(&p))
        })
        .count();
    assert_eq!(proxy_count, 1, "exactly one proxy outbound");

    assert!(
        outbounds
            .iter()
            .any(|o| o.get("protocol").and_then(|p| p.as_str()) == Some("freedom")),
        "direct/freedom outbound required"
    );
    assert!(
        outbounds
            .iter()
            .any(|o| o.get("protocol").and_then(|p| p.as_str()) == Some("blackhole")),
        "block/blackhole outbound required"
    );

    let proxy = outbounds
        .iter()
        .find(|o| o.get("protocol").and_then(|p| p.as_str()) == Some("vless"))
        .expect("vless outbound");
    assert_eq!(proxy["tag"], "node1");
    assert_eq!(
        proxy["settings"]["vnext"][0]["address"],
        "162.159.38.162"
    );
    assert_eq!(proxy["streamSettings"]["network"], "ws");
    assert_eq!(proxy["streamSettings"]["security"], "tls");
}

#[test]
fn xray_build_config_with_tun_inbound() {
    use aurestream_engine::BuildOptions;

    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config-tun.json");
    let engine = XrayEngine::new();
    let mut opts = BuildOptions::tun(17890, 17891);
    opts.smart_routing = true;
    engine
        .build_config_with_options(&path, &sample_vless_node(), opts)
        .expect("build_config tun");

    let cfg: Value = serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
    let inbounds = cfg["inbounds"].as_array().expect("inbounds");
    let tun = inbounds
        .iter()
        .find(|ib| ib.get("protocol").and_then(|p| p.as_str()) == Some("tun"))
        .expect("tun inbound required");
    assert_eq!(tun["tag"], "tun-in");
    assert_eq!(tun["settings"]["name"], "utun233");
    assert_eq!(tun["settings"]["mtu"], 1400);
    assert!(
        cfg["outbounds"]
            .as_array()
            .unwrap()
            .iter()
            .any(|o| o.get("tag").and_then(|t| t.as_str()) == Some("dns-out")),
        "dns-out required for TUN DNS capture"
    );
    assert!(cfg.get("dns").is_some(), "dns module required for TUN");
    assert_eq!(
        cfg["routing"]["domainStrategy"], "IPIfNonMatch",
        "smart_routing should use IPIfNonMatch so geoip can use built-in DNS results"
    );
    let dns_servers = cfg["dns"]["servers"].as_array().expect("dns.servers");
    let cn_servers: Vec<&Value> = dns_servers
        .iter()
        .filter(|s| s.get("tag").and_then(|t| t.as_str()) == Some("dns-direct"))
        .collect();
    assert!(!cn_servers.is_empty(), "dns-direct servers required");
    for s in &cn_servers {
        assert!(
            s.get("expectedIPs")
                .and_then(|v| v.as_array())
                .is_some_and(|a| a.iter().any(|x| x.as_str() == Some("geoip:cn"))),
            "expectedIPs (not expectIPs) required: {s}"
        );
        assert_eq!(s.get("skipFallback"), Some(&Value::Bool(true)));
    }
    let rules = cfg["routing"]["rules"].as_array().unwrap();
    let google_rule_idx = rules.iter().position(|r| {
        r.get("domain")
            .and_then(|d| d.as_array())
            .is_some_and(|a| a.iter().any(|x| x.as_str() == Some("geosite:google")))
            && r.get("outboundTag").and_then(|t| t.as_str()) != Some("direct")
            && r.get("outboundTag").and_then(|t| t.as_str()) != Some("block")
    });
    let geoip_cn_idx = rules.iter().position(|r| {
        r.get("ip")
            .and_then(|d| d.as_array())
            .is_some_and(|a| a.iter().any(|x| x.as_str() == Some("geoip:cn")))
    });
    assert!(
        google_rule_idx.is_some(),
        "smart_routing must force geosite:google via proxy (gstatic CN IP false direct)"
    );
    assert!(
        geoip_cn_idx.is_some_and(|ci| google_rule_idx.unwrap() < ci),
        "google/youtube proxy rule must precede geoip:cn"
    );
    assert!(
        rules.iter().any(|r| {
            r.get("inboundTag")
                .and_then(|t| t.as_array())
                .is_some_and(|a| a.iter().any(|v| v.as_str() == Some("tun-in")))
                && r.get("port").and_then(|p| p.as_str()) == Some("53")
        }),
        "port-53 capture on tun-in required"
    );
    assert!(
        rules.iter().any(|r| {
            r.get("inboundTag")
                .and_then(|t| t.as_array())
                .is_some_and(|a| a.iter().any(|v| v.as_str() == Some("dns-direct")))
                && r.get("outboundTag").and_then(|t| t.as_str()) == Some("direct")
        }),
        "dns-direct → direct required"
    );
    assert!(
        rules.iter().any(|r| {
            r.get("inboundTag")
                .and_then(|t| t.as_array())
                .is_some_and(|a| a.iter().any(|v| v.as_str() == Some("tun-in")))
                && r.get("port").and_then(|p| p.as_str()) == Some("443")
                && r.get("network").and_then(|n| n.as_str()) == Some("udp")
                && r.get("outboundTag").and_then(|t| t.as_str()) == Some("block")
        }),
        "WS TUN must reject QUIC so browsers fall back to TCP"
    );
    assert!(
        !rules.iter().any(|r| {
            r.get("domain")
                .and_then(|d| d.as_array())
                .is_some_and(|a| {
                    a.iter()
                        .any(|v| v.as_str() == Some("geosite:category-ads-all"))
                })
        }),
        "transport routing must not apply an ad list with false positives"
    );
    assert!(rules.iter().any(|r| {
        r.get("domain")
            .and_then(|d| d.as_array())
            .is_some_and(|a| {
                a.iter()
                    .any(|v| v.as_str() == Some("domain:github.com"))
            })
            && r.get("outboundTag").and_then(|t| t.as_str()) == Some("node1")
    }));
    // mixed inbound retained for local probe / system proxy fallback
    assert!(inbounds.iter().any(|ib| {
        matches!(
            ib.get("protocol").and_then(|p| p.as_str()),
            Some("mixed") | Some("socks")
        )
    }));
}

#[test]
fn xray_tun_keeps_quic_for_udp_native_proxy_protocol() {
    use aurestream_engine::BuildOptions;

    let mut node = ProxyNode::new("hy2", "hysteria2", "example.com", 443);
    node.password = Some("secret".into());
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config-hy2-tun.json");
    XrayEngine::new()
        .build_config_with_options(&path, &node, BuildOptions::tun(17890, 17891))
        .expect("build config");
    let cfg: Value = serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap();
    let rules = cfg["routing"]["rules"].as_array().expect("routing rules");
    assert!(
        !rules.iter().any(|r| {
            r.get("port").and_then(|p| p.as_str()) == Some("443")
                && r.get("network").and_then(|n| n.as_str()) == Some("udp")
                && r.get("outboundTag").and_then(|t| t.as_str()) == Some("block")
        }),
        "UDP-native proxy protocols must retain QUIC support"
    );
}

#[test]
fn xray_build_config_includes_api_listen() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.json");
    let engine = XrayEngine::new();
    engine
        .build_config(&path, &sample_vless_node(), 17890, 19291)
        .unwrap();
    let cfg: Value = serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
    let api_listen = cfg["api"]["listen"]
        .as_str()
        .or_else(|| {
            cfg["inbounds"].as_array()?.iter().find_map(|ib| {
                if ib.get("tag").and_then(|t| t.as_str()) == Some("api") {
                    Some(ib.get("listen")?.as_str()?)
                } else {
                    None
                }
            })
        });
    // Either api.listen or dokodemo api inbound must expose the port.
    let has_api_port = api_listen.is_some_and(|s| s.contains("19291"))
        || cfg["inbounds"].as_array().is_some_and(|arr| {
            arr.iter().any(|ib| {
                ib.get("tag").and_then(|t| t.as_str()) == Some("api")
                    && ib.get("port").and_then(|p| p.as_u64()) == Some(19291)
            })
        });
    assert!(has_api_port, "api port 19291 must appear in config");
}

#[test]
fn xray_dns_config_smart_routing() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.json");
    let engine = XrayEngine::new();

    // Build config with TUN mode (which enables smart_routing)
    let opts = aurestream_engine::BuildOptions::tun(17890, 19291);
    engine
        .build_config_with_options(&path, &sample_vless_node(), opts)
        .unwrap();

    let cfg: Value = serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
    let dns = &cfg["dns"];

    // Verify DNS config exists
    assert!(dns.is_object(), "DNS config must exist");
    assert_eq!(dns["tag"], "dns-proxy");
    assert_eq!(dns["queryStrategy"], "UseIPv4");

    let servers = dns["servers"].as_array().expect("dns.servers must be array");
    assert_eq!(servers.len(), 4, "Should have 4 DNS servers");

    // Verify first DNS server (domestic for CN domains)
    let first_dns = &servers[0];
    assert_eq!(first_dns["address"], "119.29.29.29", "First DNS should be 119.29.29.29");
    assert_eq!(first_dns["port"], 53);
    assert_eq!(first_dns["domains"][0], "geosite:cn");
    assert_eq!(first_dns["expectedIPs"][0], "geoip:cn");

    // Verify second DNS server (also for CN domains)
    let second_dns = &servers[1];
    assert_eq!(second_dns["address"], "223.5.5.5", "Second DNS should be 223.5.5.5");
    assert_eq!(second_dns["domains"][0], "geosite:cn");

    // Verify fallback DNS servers (for non-CN domains like Google, YouTube)
    assert_eq!(
        servers[2], "https://1.1.1.1/dns-query",
        "Third DNS should use Cloudflare DoH"
    );
    assert_eq!(
        servers[3], "https://8.8.8.8/dns-query",
        "Fourth DNS should use Google DoH"
    );

    println!("✓ DNS config structure correct");
    println!("✓ CN domains → 119.29.29.29, 223.5.5.5 (with geoip validation)");
    println!("✓ Non-CN domains (Google/YouTube) → Cloudflare/Google DoH fallback");
}

#[test]
fn xray_dns_config_system_proxy_mode() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.json");
    let engine = XrayEngine::new();

    // Build config with system_proxy mode (smart_routing=true, enable_tun=false)
    engine
        .build_config(&path, &sample_vless_node(), 17890, 19291)
        .unwrap();

    let cfg: Value = serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
    let dns = &cfg["dns"];

    // System proxy mode should also have smart routing DNS
    let servers = dns["servers"].as_array().expect("dns.servers must be array");
    assert_eq!(servers.len(), 4, "System proxy mode should have 4 DNS servers");

    // Should use the same smart routing DNS config
    assert_eq!(servers[0]["address"], "119.29.29.29");
    assert_eq!(servers[1]["address"], "223.5.5.5");
    assert_eq!(servers[2], "https://1.1.1.1/dns-query");
    assert_eq!(servers[3], "https://8.8.8.8/dns-query");

    println!("✓ System proxy DNS config correct");
    println!("✓ CN domains → 119.29.29.29, 223.5.5.5");
    println!("✓ Non-CN domains → Cloudflare/Google DoH");
}

