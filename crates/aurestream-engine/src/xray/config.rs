//! Map `ProxyNode` → Xray-core JSON (dialect lives here, not in aurestream-config).

use std::fs;
use std::path::Path;

use aurestream_config::{FragmentSpec, ProxyNode};
use serde_json::{json, Value};

use crate::EngineError;

const PROXY_TAG_FALLBACK: &str = "proxy";

pub fn write_xray_config(
    path: &Path,
    node: &ProxyNode,
    socks_port: u16,
    api_port: u16,
) -> Result<(), EngineError> {
    let cfg = build_xray_config_value(node, socks_port, api_port)?;
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

pub fn build_xray_config_value(
    node: &ProxyNode,
    socks_port: u16,
    api_port: u16,
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
    outbounds.push(json!({
        "tag": "direct",
        "protocol": "freedom",
        "settings": { "domainStrategy": "UseIPv4" }
    }));
    outbounds.push(json!({
        "tag": "block",
        "protocol": "blackhole"
    }));

    Ok(json!({
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
        "inbounds": [
            {
                "tag": "mixed-in",
                "listen": "127.0.0.1",
                "port": socks_port,
                "protocol": "mixed",
                "settings": { "udp": true },
                "sniffing": {
                    "enabled": true,
                    "destOverride": ["http", "tls", "quic"],
                    "routeOnly": false
                }
            },
            {
                "tag": "api",
                "listen": "127.0.0.1",
                "port": api_port,
                "protocol": "dokodemo-door",
                "settings": { "address": "127.0.0.1" }
            }
        ],
        "outbounds": outbounds,
        "routing": {
            "domainStrategy": "AsIs",
            "rules": [
                {
                    "type": "field",
                    "inboundTag": ["api"],
                    "outboundTag": "api"
                },
                {
                    // Explicit private CIDRs — no geoip.dat required for MVP direct bypass.
                    // (geo assets are still resolved at runtime for future geosite rules.)
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
                },
                {
                    "type": "field",
                    "network": "tcp,udp",
                    "outboundTag": proxy_tag
                }
            ]
        }
    }))
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
    // Hysteria2 typically needs TLS.
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
