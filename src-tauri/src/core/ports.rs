//! Mixed / controller port resolution from `settings.json` and TCP probes.

use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpStream};
use std::time::Duration;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

pub(crate) const DEFAULT_MIXED_PROXY_PORT: u16 = 2345;
pub(crate) const DEFAULT_CONTROLLER_PORT: u16 = 9191;

const MIXED_PORT_STORE_KEY: &str = "proxy_port_key";
const CONTROLLER_PORT_STORE_KEY: &str = "singbox_api_port_key";
const LEGACY_CONTROLLER_PORT_STORE_KEY: &str = "clash_api_port_key";

pub(crate) fn mixed_proxy_port(app: &AppHandle) -> u16 {
    app.get_store("settings.json")
        .and_then(|s| s.get(MIXED_PORT_STORE_KEY))
        .and_then(|v| v.as_u64())
        .and_then(|port| u16::try_from(port).ok())
        .filter(|port| *port > 0)
        .unwrap_or(DEFAULT_MIXED_PROXY_PORT)
}

pub(crate) fn controller_port(app: &AppHandle) -> u16 {
    let store = app.get_store("settings.json");
    let read = |key: &str| {
        store
            .as_ref()?
            .get(key)
            .and_then(|v| v.as_u64())
            .and_then(|port| u16::try_from(port).ok())
            .filter(|port| *port > 0)
    };
    read(CONTROLLER_PORT_STORE_KEY)
        .or_else(|| read(LEGACY_CONTROLLER_PORT_STORE_KEY))
        .unwrap_or(DEFAULT_CONTROLLER_PORT)
}

pub(crate) fn probe_port_listening(port: u16) -> bool {
    let addr = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port);
    TcpStream::connect_timeout(&addr, Duration::from_millis(100)).is_ok()
}
