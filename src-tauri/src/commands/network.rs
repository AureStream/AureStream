//! Network probe IPC (TCP connect latency for node speed test).

const PING_TCP_DEFAULT_TIMEOUT_MS: u64 = 5000;
const PING_TCP_MAX_TIMEOUT_MS: u64 = 30_000;

fn normalize_ping_tcp_timeout_ms(timeout_ms: Option<u64>) -> u64 {
    timeout_ms
        .unwrap_or(PING_TCP_DEFAULT_TIMEOUT_MS)
        .clamp(1, PING_TCP_MAX_TIMEOUT_MS)
}

/// TCP connect RTT to `host:port` in milliseconds.
///
/// Returns `Err` on connect failure or timeout so the frontend can map to `-1`.
#[tauri::command]
pub async fn ping_tcp(host: String, port: u16, timeout_ms: Option<u64>) -> Result<u64, String> {
    use std::time::{Duration, Instant};
    use tokio::net::TcpStream;
    use tokio::time::timeout;

    let host = host.trim();
    if host.is_empty() {
        return Err("empty_host".into());
    }
    if port == 0 {
        return Err("invalid_port".into());
    }

    let timeout_ms = normalize_ping_tcp_timeout_ms(timeout_ms);
    let addr = format!("{host}:{port}");
    let start = Instant::now();
    match timeout(Duration::from_millis(timeout_ms), TcpStream::connect(&addr)).await {
        Ok(Ok(_stream)) => Ok(start.elapsed().as_millis() as u64),
        Ok(Err(e)) => Err(e.to_string()),
        Err(_) => Err("Timeout".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        normalize_ping_tcp_timeout_ms, PING_TCP_DEFAULT_TIMEOUT_MS, PING_TCP_MAX_TIMEOUT_MS,
    };

    #[test]
    fn ping_tcp_defaults_to_five_seconds() {
        assert_eq!(
            normalize_ping_tcp_timeout_ms(None),
            PING_TCP_DEFAULT_TIMEOUT_MS
        );
    }

    #[test]
    fn ping_tcp_clamps_explicit_timeout() {
        assert_eq!(normalize_ping_tcp_timeout_ms(Some(0)), 1);
        assert_eq!(
            normalize_ping_tcp_timeout_ms(Some(PING_TCP_MAX_TIMEOUT_MS + 1)),
            PING_TCP_MAX_TIMEOUT_MS
        );
    }
}
