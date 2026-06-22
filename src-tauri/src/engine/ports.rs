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

/// Ask the privileged helper (root) to forcibly free a port, then poll with
/// `TcpListener::bind` until the port is truly available or the timeout expires.
///
/// On macOS this delegates to `ensurePortFree` XPC which kills processes in all
/// TCP states (not just LISTEN). When the XPC helper is unreachable (common after
/// `stopSingBox`), falls back to user-level `free_port` (lsof + kill), then
/// polls `probe_port_bindable` with exponential backoff.
#[cfg(target_os = "macos")]
pub(crate) async fn ensure_port_free_with_retry(
    port: u16,
    timeout: Duration,
) -> Result<(), String> {
    use tokio::time::{sleep, Instant};

    if probe_port_bindable(port) {
        return Ok(());
    }

    let deadline = Instant::now() + timeout;
    let mut attempt: u32 = 0;
    let mut last_killed: i32 = 0;
    let mut xpc_dead = false;

    loop {
        attempt += 1;

        if !xpc_dead {
            match tokio::task::spawn_blocking(move || {
                aurestream_plugin_privilege::macos::helper::api::ensure_port_free(port)
            })
            .await
            {
                Ok(Ok(killed)) => {
                    last_killed = killed;
                    log::info!(
                        "[port-cleanup] :{port} attempt {attempt}: helper killed {killed} process(es)"
                    );
                }
                Ok(Err(e)) => {
                    log::warn!("[port-cleanup] :{port} attempt {attempt}: helper error: {e}");
                    // XPC is unreachable — fall back to user-level cleanup once,
                    // then switch to poll-only mode.
                    if !xpc_dead {
                        xpc_dead = true;
                        log::info!("[port-cleanup] :{port} falling back to user-level free_port");
                        let result = tokio::task::spawn_blocking(move || {
                            aurestream_plugin_privilege::free_port(port)
                        })
                        .await
                        .unwrap_or_else(|e| {
                            log::error!("[port-cleanup] :{port} free_port join error: {e}");
                            aurestream_plugin_privilege::KillOrphansResult {
                                success: false,
                                killed_pids: vec![],
                                port_released: false,
                                message: format!("join error: {e}"),
                            }
                        });
                        if result.port_released {
                            log::info!("[port-cleanup] :{port} free_port released after {attempt} attempt(s)");
                            return Ok(());
                        }
                        last_killed = result.killed_pids.len() as i32;
                        log::info!("[port-cleanup] :{port} free_port: {}", result.message);
                    }
                }
                Err(e) => {
                    log::warn!(
                        "[port-cleanup] :{port} attempt {attempt}: spawn_blocking error: {e}"
                    );
                    xpc_dead = true;
                }
            }
        }

        // Give the kernel time to release the port after killing processes.
        sleep(Duration::from_millis(300)).await;

        if probe_port_bindable(port) {
            log::info!(
                "[port-cleanup] :{port} bindable after {attempt} attempt(s), {last_killed} process(es) killed"
            );
            return Ok(());
        }

        if Instant::now() >= deadline {
            return Err(format!(
                "port :{port} still not bindable after {timeout:?} ({attempt} attempts, {last_killed} processes killed)"
            ));
        }

        // Exponential backoff: 500ms, 1s, 2s, 2s...
        let backoff = std::cmp::min(
            Duration::from_millis(500).saturating_mul(2u32.saturating_pow(attempt - 1)),
            Duration::from_secs(2),
        );
        sleep(backoff).await;
    }
}
