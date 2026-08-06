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
    // mixed inbound retained for local probe / system proxy fallback
    assert!(inbounds.iter().any(|ib| {
        matches!(
            ib.get("protocol").and_then(|p| p.as_str()),
            Some("mixed") | Some("socks")
        )
    }));
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
