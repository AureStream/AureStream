use sysproxy_rs::Sysproxy;
use tauri::{AppHandle, Emitter};
use tauri_plugin_store::StoreExt;

use crate::core::mixed_proxy_port;
use crate::engine::common::bypass::{self, PROXY_BYPASS_STORE_KEY};
use crate::engine::EVENT_TAURI_LOG;

const PROXY_HOST: &str = "127.0.0.1";

fn proxy_bypass_list(app: &AppHandle) -> String {
    let raw = app
        .get_store("settings.json")
        .and_then(|s| s.get(PROXY_BYPASS_STORE_KEY))
        .and_then(|v| v.as_str().map(String::from));
    bypass::bypass_from_store_value(raw)
}

pub(crate) async fn set_system_proxy(app: &AppHandle) -> anyhow::Result<()> {
    let proxy_port = mixed_proxy_port(app);
    let bypass = proxy_bypass_list(app);
    let _ = app.emit(
        EVENT_TAURI_LOG,
        (
            0,
            format!("Start set system proxy: {}:{}", PROXY_HOST, proxy_port),
        ),
    );
    let sys = Sysproxy {
        enable: true,
        host: PROXY_HOST.to_string(),
        port: proxy_port,
        bypass,
    };
    sys.set_system_proxy().map_err(|e| anyhow::anyhow!(e))?;
    log::info!("Proxy set to {}:{}", PROXY_HOST, proxy_port);
    Ok(())
}

pub(crate) async fn clear_system_proxy(app: &AppHandle) -> anyhow::Result<()> {
    let _ = app.emit(EVENT_TAURI_LOG, (0, "Start unset system proxy"));
    let mut sysproxy = match Sysproxy::get_system_proxy() {
        Ok(proxy) => proxy,
        Err(e) => {
            let msg = format!("Sysproxy::get_system_proxy failed: {}", e);
            let _ = app.emit(EVENT_TAURI_LOG, (1, msg.clone()));
            return Err(anyhow::anyhow!(msg));
        }
    };
    sysproxy.enable = false;
    if let Err(e) = sysproxy.set_system_proxy() {
        let msg = format!("Sysproxy::set_system_proxy failed: {}", e);
        let _ = app.emit(EVENT_TAURI_LOG, (1, msg.clone()));
        return Err(anyhow::anyhow!(msg));
    }
    let _ = app.emit(EVENT_TAURI_LOG, (0, "System proxy unset successfully"));
    log::info!("Proxy unset");
    Ok(())
}
