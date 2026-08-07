//! Map `ProxyNode` → Xray-core JSON (dialect lives here, not in aurestream-config).

use std::fs;
use std::path::Path;

use aurestream_config::{FragmentSpec, ProxyNode};
use serde_json::{json, Value};

use crate::EngineError;

const PROXY_TAG_FALLBACK: &str = "proxy";
const TUN_INTERFACE_NAME: &str = "utun233";
const TUN_GATEWAY_CIDR: &str = "198.18.0.1/30";
const TUN_DNS_SERVERS: &[&str] = &["1.1.1.1", "8.8.8.8"];

/// IPv4 complement of private/LAN ranges for `autoSystemRoutingTable`
/// (route everything except 10/8, 172.16/12, 192.168/16, 127/8, 169.254/16).
const IPV4_EXCLUDING_LAN: &[&str] = &[
    "0.0.0.0/5",
    "8.0.0.0/7",
    "11.0.0.0/8",
    "12.0.0.0/6",
    "16.0.0.0/4",
    "32.0.0.0/3",
    "64.0.0.0/3",
    "96.0.0.0/4",
    "112.0.0.0/5",
    "120.0.0.0/6",
    "124.0.0.0/7",
    "126.0.0.0/8",
    "128.0.0.0/3",
    "160.0.0.0/5",
    "168.0.0.0/8",
    "169.0.0.0/9",
    "169.128.0.0/10",
    "169.192.0.0/11",
    "169.224.0.0/12",
    "169.240.0.0/13",
    "169.248.0.0/14",
    "169.252.0.0/15",
    "169.255.0.0/16",
    "170.0.0.0/7",
    "172.0.0.0/12",
    "172.32.0.0/11",
    "172.64.0.0/10",
    "172.128.0.0/9",
    "173.0.0.0/8",
    "174.0.0.0/7",
    "176.0.0.0/4",
    "192.0.0.0/9",
    "192.128.0.0/11",
    "192.160.0.0/13",
    "192.169.0.0/16",
    "192.170.0.0/15",
    "192.172.0.0/14",
    "192.176.0.0/12",
    "192.192.0.0/10",
    "193.0.0.0/8",
    "194.0.0.0/7",
    "196.0.0.0/6",
    "200.0.0.0/5",
    "208.0.0.0/4",
    "224.0.0.0/3",
];

/// Options for Xray dialect generation (MVP system proxy + TUN).
#[derive(Debug, Clone, Copy)]
pub struct BuildOptions {
    pub socks_port: u16,
    pub api_port: u16,
    pub enable_tun: bool,
    pub enable_ipv6: bool,
    /// When true with TUN: route 0.0.0.0/0 into tunnel (bypass-router). Default false excludes LAN.
    pub bypass_router: bool,
    /// When true: geosite:cn direct (rule mode). When false: global proxy for non-LAN.
    pub smart_routing: bool,
}

impl BuildOptions {
    pub fn system_proxy(socks_port: u16, api_port: u16) -> Self {
        Self {
            socks_port,
            api_port,
            enable_tun: false,
            enable_ipv6: false,
            bypass_router: false,
            smart_routing: true,
        }
    }

    pub fn tun(socks_port: u16, api_port: u16) -> Self {
        Self {
            socks_port,
            api_port,
            enable_tun: true,
            enable_ipv6: false,
            bypass_router: false,
            smart_routing: true,
        }
    }
}

pub fn write_xray_config_with_options(
    path: &Path,
    node: &ProxyNode,
    opts: BuildOptions,
) -> Result<(), EngineError> {
    let cfg = build_xray_config_value_with_options(node, opts)?;
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|e| {
                EngineError::io(format!("create config dir {}: {e}", parent.display()))
            })?;
        }
    }
    let body = serde_json::to_string_pretty(&cfg)
        .map_err(|e| EngineError::config(format!("serialize xray config: {e}")))?;
    fs::write(path, body)
        .map_err(|e| EngineError::io(format!("write {}: {e}", path.display())))?;
    Ok(())
}

pub fn build_xray_config_value_with_options(
    node: &ProxyNode,
    opts: BuildOptions,
) -> Result<Value, EngineError> {
    let (proxy_outbound, fragment_outbound) = map_proxy_outbound(node)?;
    let proxy_tag = proxy_outbound
        .get("tag")
        .and_then(|t| t.as_str())
        .unwrap_or(PROXY_TAG_FALLBACK)
        .to_string();

    let mut outbounds = Vec::new();
    outbounds.push(proxy_outbound);
    if let Some(frag) = fragment_outbound {
        outbounds.push(frag);
    }
    // Present whenever TUN may capture OS DNS (port 53 → this outbound).
    if opts.enable_tun {
        outbounds.push(json!({
            "tag": "dns-out",
            "protocol": "dns",
            "settings": {}
        }));
    }
    let domain_strategy = if opts.enable_ipv6 { "UseIP" } else { "UseIPv4" };
    outbounds.push(json!({
        "tag": "direct",
        "protocol": "freedom",
        "settings": { "domainStrategy": domain_strategy }
    }));
    outbounds.push(json!({
        "tag": "block",
        "protocol": "blackhole"
    }));

    let mut inbounds = vec![
        json!({
            "tag": "mixed-in",
            "listen": "127.0.0.1",
            "port": opts.socks_port,
            "protocol": "mixed",
            "settings": { "udp": true },
            "sniffing": {
                "enabled": true,
                "destOverride": ["http", "tls", "quic"],
                "routeOnly": false
            }
        }),
        json!({
            "tag": "api",
            "listen": "127.0.0.1",
            "port": opts.api_port,
            "protocol": "dokodemo-door",
            "settings": { "address": "127.0.0.1" }
        }),
    ];

    if opts.enable_tun {
        inbounds.push(build_tun_inbound(opts.bypass_router, opts.enable_ipv6));
    }

    let mut rules = vec![json!({
        "type": "field",
        "inboundTag": ["api"],
        "outboundTag": "api"
    })];

    // Built-in DNS query traffic (dns.tag / per-server tag) — before business rules.
    // See https://xtls.github.io/document/level-1/routing-with-dns.html
    let use_dns_module = opts.enable_tun || opts.smart_routing;
    if use_dns_module {
        if opts.smart_routing {
            rules.push(json!({
                "type": "field",
                "inboundTag": ["dns-direct"],
                "outboundTag": "direct"
            }));
        }
        rules.push(json!({
            "type": "field",
            "inboundTag": ["dns-proxy"],
            "outboundTag": proxy_tag.clone()
        }));
    }

    if opts.enable_tun {
        // OS DNS packets entering TUN → dns outbound → built-in DNS module.
        rules.push(json!({
            "type": "field",
            "inboundTag": ["tun-in"],
            "port": "53",
            "network": "udp,tcp",
            "outboundTag": "dns-out"
        }));
        // Drop link-local / NetBIOS noise on TUN.
        rules.push(json!({
            "type": "field",
            "ip": ["169.254.0.0/16", "fe80::/10"],
            "outboundTag": "block"
        }));
        rules.push(json!({
            "type": "field",
            "port": "137,138",
            "network": "udp",
            "outboundTag": "block"
        }));
    }

    rules.push(json!({
        "type": "field",
        "ip": [
            "0.0.0.0/8",
            "10.0.0.0/8",
            "127.0.0.0/8",
            "169.254.0.0/16",
            "172.16.0.0/12",
            "192.168.0.0/16",
            "224.0.0.0/4",
            "240.0.0.0/4",
            "::1/128",
            "fc00::/7",
            "fe80::/10"
        ],
        "outboundTag": "direct"
    }));

    if opts.smart_routing {
        // Prefer geosite/geoip when assets present; harmless if missing at dial time for non-matching.
        rules.push(json!({
            "type": "field",
            "ip": ["geoip:private"],
            "outboundTag": "direct"
        }));
        // Google/YouTube must hit proxy *before* geoip:cn. In CN, gstatic/googleapis often
        // resolve to domestic CDN IPs; IPIfNonMatch would otherwise send them direct and
        // break/slow YouTube + Google static assets.
        rules.push(json!({
            "type": "field",
            "domain": [
                "geosite:google",
                "geosite:youtube",
                "domain:googleapis.com",
                "domain:gstatic.com",
                "domain:googlevideo.com",
                "domain:youtube.com",
                "domain:youtu.be",
                "domain:ytimg.com",
                "domain:ggpht.com",
                "domain:youtube-nocookie.com",
                "domain:withyoutube.com"
            ],
            "outboundTag": proxy_tag
        }));
        // Domain CN list before IP CN list so pure domain hits win under IPIfNonMatch.
        rules.push(json!({
            "type": "field",
            "domain": ["geosite:cn"],
            "outboundTag": "direct"
        }));
        rules.push(json!({
            "type": "field",
            "ip": ["geoip:cn"],
            "outboundTag": "direct"
        }));
        rules.push(json!({
            "type": "field",
            "domain": ["geosite:category-ads-all"],
            "outboundTag": "block"
        }));
    }

    rules.push(json!({
        "type": "field",
        "network": "tcp,udp",
        "outboundTag": proxy_tag
    }));

    // IPIfNonMatch: match domain rules first; if no hit, resolve via built-in DNS
    // then re-match geoip (official routing-with-dns guide). AsIs when global proxy.
    let routing_domain_strategy = if opts.smart_routing {
        "IPIfNonMatch"
    } else {
        "AsIs"
    };

    let mut root = json!({
        "log": { "loglevel": "warning" },
        "api": {
            "tag": "api",
            "services": ["HandlerService", "StatsService"]
        },
        "stats": {},
        "policy": {
            "system": {
                "statsInboundUplink": true,
                "statsInboundDownlink": true,
                "statsOutboundUplink": true,
                "statsOutboundDownlink": true
            }
        },
        "inbounds": inbounds,
        "outbounds": outbounds,
        "routing": {
            "domainStrategy": routing_domain_strategy,
            "rules": rules
        }
    });

    if use_dns_module {
        root["dns"] = build_dns_config(opts.smart_routing, opts.enable_ipv6);
    }

    Ok(root)
}

fn build_tun_inbound(bypass_router: bool, enable_ipv6: bool) -> Value {
    let mut route_table: Vec<Value> = if bypass_router {
        vec![Value::String("0.0.0.0/0".into())]
    } else {
        IPV4_EXCLUDING_LAN
            .iter()
            .map(|s| Value::String((*s).into()))
            .collect()
    };
    if enable_ipv6 {
        route_table.push(Value::String("::/0".into()));
    }

    json!({
        "tag": "tun-in",
        "protocol": "tun",
        "settings": {
            "name": TUN_INTERFACE_NAME,
            "desc": "AureStream TUN",
            "mtu": 1500,
            "gateway": [TUN_GATEWAY_CIDR],
            "dns": TUN_DNS_SERVERS,
            "autoSystemRoutingTable": route_table,
            "autoOutboundsInterface": "auto"
        },
        "sniffing": {
            "enabled": true,
            "destOverride": ["http", "tls", "quic"],
            "routeOnly": false
        }
    })
}

fn build_dns_config(smart_routing: bool, enable_ipv6: bool) -> Value {
    let query_strategy = if enable_ipv6 { "UseIP" } else { "UseIPv4" };
    if !smart_routing {
        return json!({
            "servers": ["1.1.1.1", "8.8.8.8"],
            "tag": "dns-proxy",
            "queryStrategy": query_strategy
        });
    }
    // Xray DNS routing: https://xtls.github.io/config/dns.html
    // Strategy: CN domains use domestic DNS with IP validation, all others use fallback.
    // Xray matches domains rules from top to bottom, unmatched domains use fallback servers.
    json!({
        "tag": "dns-proxy",
        "queryStrategy": query_strategy,
        "servers": [
            // Domestic DNS for CN domains ONLY (with expectedIPs validation)
            {
                "tag": "dns-direct",
                "address": "119.29.29.29",
                "port": 53,
                "domains": ["geosite:cn"],
                "expectedIPs": ["geoip:cn"],
                "skipFallback": true
            },
            {
                "tag": "dns-direct",
                "address": "223.5.5.5",
                "port": 53,
                "domains": ["geosite:cn"],
                "expectedIPs": ["geoip:cn"],
                "skipFallback": true
            },
            // Fallback DNS for ALL non-CN domains (Google, YouTube, and everything else)
            // No "domains" rule = handles all unmatched queries
            "1.1.1.1",
            "8.8.8.8"
        ]
    })
}

fn map_proxy_outbound(node: &ProxyNode) -> Result<(Value, Option<Value>), EngineError> {
    let protocol = node.protocol.to_lowercase();
    let tag = if node.tag.is_empty() {
        PROXY_TAG_FALLBACK.to_string()
    } else {
        node.tag.clone()
    };

    let mut outbound = match protocol.as_str() {
        "vless" => map_vless(&tag, node)?,
        "vmess" => map_vmess(&tag, node)?,
        "trojan" => map_trojan(&tag, node)?,
        "shadowsocks" | "ss" => map_shadowsocks(&tag, node)?,
        "hysteria2" | "hy2" => map_hysteria2(&tag, node)?,
        other => {
            return Err(EngineError::config(format!(
                "unsupported proxy protocol for xray dialect: {other}"
            )));
        }
    };

    let fragment = node.fragment.as_ref().map(fragment_outbound);
    if let Some(ref frag) = fragment {
        let frag_tag = frag
            .get("tag")
            .and_then(|t| t.as_str())
            .unwrap_or("fragment-out")
            .to_string();
        let stream = outbound
            .as_object_mut()
            .ok_or_else(|| EngineError::config("outbound must be object"))?
            .entry("streamSettings")
            .or_insert_with(|| json!({}));
        let stream_obj = stream
            .as_object_mut()
            .ok_or_else(|| EngineError::config("streamSettings must be object"))?;
        let sockopt = stream_obj.entry("sockopt").or_insert_with(|| json!({}));
        sockopt
            .as_object_mut()
            .ok_or_else(|| EngineError::config("sockopt must be object"))?
            .insert("dialerProxy".into(), Value::String(frag_tag));
    }

    Ok((outbound, fragment))
}

fn fragment_outbound(spec: &FragmentSpec) -> Value {
    json!({
        "tag": "fragment-out",
        "protocol": "freedom",
        "settings": {
            "fragment": {
                "packets": spec.packets,
                "length": spec.length,
                "interval": spec.interval
            }
        }
    })
}

fn map_vless(tag: &str, node: &ProxyNode) -> Result<Value, EngineError> {
    let uuid = node
        .uuid
        .as_deref()
        .ok_or_else(|| EngineError::config("vless requires uuid"))?;
    let mut user = json!({
        "id": uuid,
        "encryption": node.encryption.clone().unwrap_or_else(|| "none".into())
    });
    if let Some(flow) = &node.flow {
        if !flow.is_empty() {
            user["flow"] = Value::String(flow.clone());
        }
    }

    let mut outbound = json!({
        "tag": tag,
        "protocol": "vless",
        "settings": {
            "vnext": [{
                "address": node.server,
                "port": node.port,
                "users": [user]
            }]
        }
    });
    if let Some(stream) = build_stream_settings(node) {
        outbound["streamSettings"] = stream;
    }
    Ok(outbound)
}

fn map_vmess(tag: &str, node: &ProxyNode) -> Result<Value, EngineError> {
    let uuid = node
        .uuid
        .as_deref()
        .ok_or_else(|| EngineError::config("vmess requires uuid"))?;
    let mut outbound = json!({
        "tag": tag,
        "protocol": "vmess",
        "settings": {
            "vnext": [{
                "address": node.server,
                "port": node.port,
                "users": [{
                    "id": uuid,
                    "security": node.encryption.clone().unwrap_or_else(|| "auto".into()),
                    "alterId": 0
                }]
            }]
        }
    });
    if let Some(stream) = build_stream_settings(node) {
        outbound["streamSettings"] = stream;
    }
    Ok(outbound)
}

fn map_trojan(tag: &str, node: &ProxyNode) -> Result<Value, EngineError> {
    let password = node
        .password
        .as_deref()
        .ok_or_else(|| EngineError::config("trojan requires password"))?;
    let mut outbound = json!({
        "tag": tag,
        "protocol": "trojan",
        "settings": {
            "servers": [{
                "address": node.server,
                "port": node.port,
                "password": password
            }]
        }
    });
    if let Some(stream) = build_stream_settings(node) {
        outbound["streamSettings"] = stream;
    }
    Ok(outbound)
}

fn map_shadowsocks(tag: &str, node: &ProxyNode) -> Result<Value, EngineError> {
    let method = node
        .method
        .as_deref()
        .ok_or_else(|| EngineError::config("shadowsocks requires method"))?;
    let password = node
        .password
        .as_deref()
        .ok_or_else(|| EngineError::config("shadowsocks requires password"))?;
    Ok(json!({
        "tag": tag,
        "protocol": "shadowsocks",
        "settings": {
            "servers": [{
                "address": node.server,
                "port": node.port,
                "method": method,
                "password": password
            }]
        }
    }))
}

fn map_hysteria2(tag: &str, node: &ProxyNode) -> Result<Value, EngineError> {
    let password = node
        .password
        .as_deref()
        .ok_or_else(|| EngineError::config("hysteria2 requires password"))?;
    let mut outbound = json!({
        "tag": tag,
        "protocol": "hysteria2",
        "settings": {
            "servers": [{
                "address": node.server,
                "port": node.port,
                "password": password
            }]
        }
    });
    let mut stream = build_stream_settings(node).unwrap_or_else(|| json!({}));
    if stream.get("security").is_none() {
        stream["security"] = Value::String("tls".into());
        stream["tlsSettings"] = json!({
            "serverName": node.sni.clone().unwrap_or_else(|| node.server.clone()),
            "allowInsecure": node.allow_insecure
        });
    }
    outbound["streamSettings"] = stream;
    Ok(outbound)
}

fn build_stream_settings(node: &ProxyNode) -> Option<Value> {
    let mut stream = serde_json::Map::new();
    let mut has = false;

    let net = node.network.to_lowercase();
    if net != "tcp" && !net.is_empty() {
        has = true;
        stream.insert("network".into(), Value::String(net.clone()));
        match net.as_str() {
            "ws" => {
                let mut ws = serde_json::Map::new();
                ws.insert(
                    "path".into(),
                    Value::String(node.path.clone().unwrap_or_else(|| "/".into())),
                );
                if let Some(host) = &node.host {
                    ws.insert("host".into(), Value::String(host.clone()));
                }
                stream.insert("wsSettings".into(), Value::Object(ws));
            }
            "grpc" => {
                stream.insert(
                    "grpcSettings".into(),
                    json!({
                        "serviceName": node.grpc_service_name.clone()
                            .or_else(|| node.path.clone())
                            .unwrap_or_default()
                    }),
                );
            }
            "httpupgrade" => {
                let mut hu = serde_json::Map::new();
                hu.insert(
                    "path".into(),
                    Value::String(node.path.clone().unwrap_or_else(|| "/".into())),
                );
                if let Some(host) = &node.host {
                    hu.insert("host".into(), Value::String(host.clone()));
                }
                stream.insert("httpupgradeSettings".into(), Value::Object(hu));
            }
            "xhttp" => {
                let mut xh = serde_json::Map::new();
                xh.insert(
                    "path".into(),
                    Value::String(node.path.clone().unwrap_or_else(|| "/".into())),
                );
                if let Some(host) = &node.host {
                    xh.insert("host".into(), Value::String(host.clone()));
                }
                stream.insert("xhttpSettings".into(), Value::Object(xh));
            }
            _ => {}
        }
    }

    let security = node.security.to_lowercase();
    if security == "tls" || security == "reality" {
        has = true;
        stream.insert("security".into(), Value::String(security.clone()));
        let sni = node
            .sni
            .clone()
            .or_else(|| node.host.clone())
            .unwrap_or_else(|| node.server.clone());
        if security == "tls" {
            let mut tls = serde_json::Map::new();
            tls.insert("serverName".into(), Value::String(sni));
            if let Some(fp) = &node.fingerprint {
                tls.insert("fingerprint".into(), Value::String(fp.clone()));
            }
            if let Some(alpn) = &node.alpn {
                tls.insert(
                    "alpn".into(),
                    Value::Array(alpn.iter().cloned().map(Value::String).collect()),
                );
            }
            if node.allow_insecure {
                tls.insert("allowInsecure".into(), Value::Bool(true));
            }
            stream.insert("tlsSettings".into(), Value::Object(tls));
        } else {
            let mut reality = serde_json::Map::new();
            reality.insert("serverName".into(), Value::String(sni));
            reality.insert(
                "publicKey".into(),
                Value::String(node.reality_public_key.clone().unwrap_or_default()),
            );
            reality.insert(
                "shortId".into(),
                Value::String(node.reality_short_id.clone().unwrap_or_default()),
            );
            if let Some(fp) = &node.fingerprint {
                reality.insert("fingerprint".into(), Value::String(fp.clone()));
            }
            if let Some(spx) = &node.reality_spider_x {
                reality.insert("spiderX".into(), Value::String(spx.clone()));
            }
            stream.insert("realitySettings".into(), Value::Object(reality));
        }
    }

    if has {
        Some(Value::Object(stream))
    } else {
        None
    }
}
