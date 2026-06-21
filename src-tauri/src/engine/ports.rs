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

pub fn mixed_proxy_port(app: &AppHandle) -> u16 {
    app.get_store("settings.json")
        .and_then(|s| s.get(MIXED_PORT_STORE_KEY))
        .and_then(|v| v.as_u64())
        .and_then(|port| u16::try_from(port).ok())
        .filter(|port| *port > 0)
        .unwrap_or(DEFAULT_MIXED_PROXY_PORT)
}

pub fn controller_port(app: &AppHandle) -> u16 {
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

pub fn probe_port_listening(port: u16) -> bool {
    let addr = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port);
    TcpStream::connect_timeout(&addr, Duration::from_millis(100)).is_ok()
}

/// Returns `true` when the port is truly free for a new `bind()`.
///
/// Unlike `probe_port_listening` (which uses `TcpStream::connect`), this
/// attempts an actual `TcpListener::bind`.  It catches TIME_WAIT and other
/// kernel-level port holds that a connect-based probe misses.
pub fn probe_port_bindable(port: u16) -> bool {
    use std::net::TcpListener;
    let addr = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port);
    TcpListener::bind(addr).is_ok()
}

/// Poll until mixed proxy port accepts connections or timeout (all platforms).
pub(crate) async fn wait_for_port_listening(port: u16, timeout: Duration) -> bool {
    poll_port(port, timeout, true).await
}

/// Poll until a localhost port becomes bindable (truly free) or timeout.
pub(crate) async fn wait_for_port_bindable(port: u16, timeout: Duration) -> bool {
    use tokio::time::{sleep, Instant};

    if probe_port_bindable(port) {
        return true;
    }

    let deadline = Instant::now() + timeout;
    let mut interval = Duration::from_millis(50);

    while Instant::now() < deadline {
        if probe_port_bindable(port) {
            return true;
        }
        sleep(interval).await;
        interval = std::cmp::min(interval.saturating_mul(2), Duration::from_millis(200));
    }

    probe_port_bindable(port)
}

async fn poll_port(port: u16, timeout: Duration, wait_listening: bool) -> bool {
    use tokio::time::{sleep, Instant};

    let satisfied = || probe_port_listening(port) == wait_listening;
    if satisfied() {
        return true;
    }

    let deadline = Instant::now() + timeout;
    let mut interval = Duration::from_millis(20);

    while Instant::now() < deadline {
        if satisfied() {
            return true;
        }
        sleep(interval).await;
        interval = std::cmp::min(interval.saturating_mul(2), Duration::from_millis(100));
    }

    satisfied()
}
