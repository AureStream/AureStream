//! Pure config.json rewrites used by the Windows TUN start path.
//! Kept free of `cfg(windows)` so unit tests run on every host CI.

/// Rewrite `config.json` so the TUN inbound binds outbounds to `iface`
/// (and the `direct` freedom outbound gets the same `sockopt.interface`).
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

    // Belt-and-suspenders: bind freedom/direct so CN-direct dials also leave
    // via the physical NIC when autoOutboundsInterface is ignored.
    if let Some(outbounds) = v.get_mut("outbounds").and_then(|x| x.as_array_mut()) {
        for ob in outbounds.iter_mut() {
            let tag = ob.get("tag").and_then(|t| t.as_str()).unwrap_or("");
            let proto = ob.get("protocol").and_then(|p| p.as_str()).unwrap_or("");
            if !(tag == "direct" && proto == "freedom") {
                continue;
            }
            let obj = ob
                .as_object_mut()
                .ok_or_else(|| "direct outbound is not an object".to_string())?;
            let stream = obj
                .entry("streamSettings")
                .or_insert_with(|| serde_json::json!({}));
            let stream_obj = stream
                .as_object_mut()
                .ok_or_else(|| "streamSettings is not an object".to_string())?;
            let sockopt = stream_obj
                .entry("sockopt")
                .or_insert_with(|| serde_json::json!({}));
            let sockopt_obj = sockopt
                .as_object_mut()
                .ok_or_else(|| "sockopt is not an object".to_string())?;
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

    if changed {
        let out =
            serde_json::to_vec_pretty(&v).map_err(|e| format!("serialize config: {}", e))?;
        std::fs::write(config_path, out)
            .map_err(|e| format!("write config {}: {}", config_path, e))?;
    }
    Ok(changed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn patch_sets_auto_outbounds_and_direct_sockopt() {
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
                    "gateway": ["172.19.0.1/30"]
                }
            }],
            "outbounds": [
                { "tag": "direct", "protocol": "freedom", "settings": {} },
                { "tag": "proxy", "protocol": "vless" }
            ]
        });
        {
            let mut f = std::fs::File::create(&path).unwrap();
            f.write_all(cfg.to_string().as_bytes()).unwrap();
        }

        let changed =
            patch_tun_config_outbounds_interface(path.to_str().unwrap(), "以太网").unwrap();
        assert!(changed);

        let parsed: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(
            parsed["inbounds"][0]["settings"]["autoOutboundsInterface"],
            "以太网"
        );
        assert_eq!(
            parsed["outbounds"][0]["streamSettings"]["sockopt"]["interface"],
            "以太网"
        );
        assert!(parsed["outbounds"][1].get("streamSettings").is_none());

        let changed2 =
            patch_tun_config_outbounds_interface(path.to_str().unwrap(), "以太网").unwrap();
        assert!(!changed2);

        let _ = std::fs::remove_dir_all(&dir);
    }
}
