//! DNS benchmarking, low-level UDP DNS resolution, and "best local DNS"
//! picker exposed as a Tauri command.

use std::collections::HashSet;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};

use tauri::{AppHandle, Manager};
use tokio::net::UdpSocket;
use tokio::sync::mpsc;
use tokio::time::{timeout, Duration};

/// DNS servers classified by region for targeted benchmarking.
const CN_DNS_SERVERS: &[&str] = &[
    "1.2.4.8",
    "114.114.114.114",
    "114.114.115.115",
    "119.29.29.29",
    "180.184.1.1",
    "180.184.2.2",
    "180.76.76.76",
    "210.2.4.8",
    "223.5.5.5",
    "223.6.6.6",
];

const GLOBAL_DNS_SERVERS: &[&str] = &[
    "1.1.1.1",
    "8.8.4.4",
    "8.8.8.8",
    "9.9.9.9",
    "149.112.112.112",
    "149.112.112.9",
    "208.67.220.220",
    "208.67.220.222",
    "208.67.222.220",
    "208.67.222.222",
];

/// All 29 servers (kept for backward compat and fallback).
pub(crate) static DNSSERVERDICT: [&str; 29] = [
    "1.1.1.1", // Cloudflare DNS
    "1.2.4.8", // CN DNS
    "101.101.101.101",
    "101.102.103.104",
    "114.114.114.114", // CN 114DNS
    "114.114.115.115", // CN 114DNS
    "119.29.29.29",    // CN Tencent DNS
    "149.112.112.112",
    "149.112.112.9",
    "180.184.1.1",
    "180.184.2.2",
    "180.76.76.76",
    "2.188.21.131", // Iran Yokhdi! DNS
    "2.188.21.132", // Iran Yokhdi! DNS
    "2.189.44.44",  // Iran DNS
    "202.175.3.3",
    "202.175.3.8",
    "208.67.220.220", // OpenDNS
    "208.67.220.222", // OpenDNS
    "208.67.222.220", // OpenDNS
    "208.67.222.222", // OpenDNS
    "210.2.4.8",
    "223.5.5.5", // CN Alibaba DNS
    "223.6.6.6", // CN Alibaba DNS
    "77.88.8.1",
    "77.88.8.8",
    "8.8.4.4", // Google DNS
    "8.8.8.8", // Google DNS
    "9.9.9.9", // Quad9 DNS
];

pub(crate) fn is_ip_address(s: &str) -> bool {
    s.parse::<std::net::IpAddr>().is_ok()
}

pub(crate) async fn probe_dns_server(
    dns: String,
    tx: Option<mpsc::Sender<(String, std::time::Duration)>>,
) {
    let start = std::time::Instant::now();

    let ns_addr: SocketAddr = match format!("{}:53", dns).parse() {
        Ok(addr) => addr,
        Err(_) => return,
    };
    let bind_addr = if ns_addr.is_ipv4() {
        "0.0.0.0:0"
    } else {
        "[::]:0"
    };

    let socket = match UdpSocket::bind(bind_addr).await {
        Ok(s) => s,
        Err(_) => return,
    };
    if socket.connect(ns_addr).await.is_err() {
        return;
    }

    // A-query for www.baidu.com
    let mut payload = vec![
        0x12, 0x34, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ];
    payload.extend_from_slice(&[
        3, b'w', b'w', b'w', 5, b'b', b'a', b'i', b'd', b'u', 3, b'c', b'o', b'm', 0,
    ]);
    payload.extend_from_slice(&[0x00, 0x01, 0x00, 0x01]);

    if socket.send(&payload).await.is_err() {
        return;
    }

    let mut buf = [0u8; 512];
    match timeout(Duration::from_millis(500), socket.recv(&mut buf)).await {
        Ok(Ok(len)) if len >= 12 && buf[0] == 0x12 && buf[1] == 0x34 => {
            let elapsed = start.elapsed();
            let padded_dns: String = format!("{:<20}", dns);
            log::info!(
                "✓ DNS {} responded successfully, latency: {:?}",
                padded_dns,
                elapsed
            );

            if let Some(tx) = tx {
                let _ = tx.try_send((dns, elapsed));
            }
        }
        _ => {
            let padded_dns: String = format!("{:<20}", dns);
            log::info!("✗ DNS {} failed or timed out", padded_dns);
        }
    }
}

#[allow(dead_code)]
pub(crate) async fn probe_dns_reachable(dns: &str) -> bool {
    let (tx, mut rx) = mpsc::channel::<(String, std::time::Duration)>(1);
    probe_dns_server(dns.to_string(), Some(tx)).await;
    rx.recv().await.is_some()
}

#[allow(dead_code)]
pub async fn get_best_dns_server() -> Option<String> {
    let backup_dns = "223.5.5.5".to_string();
    let (tx, mut rx) = mpsc::channel::<(String, std::time::Duration)>(1);

    for dns in DNSSERVERDICT {
        let dns = dns.to_string();
        let tx = tx.clone();
        tokio::spawn(async move {
            probe_dns_server(dns, Some(tx)).await;
        });
    }

    drop(tx);

    match rx.recv().await {
        Some((dns, _)) => {
            log::info!("✓ DNS {} is selected as the optimal server", dns);
            Some(dns)
        }
        None => {
            log::info!("✗ All DNS servers failed, falling back to: {}", backup_dns);
            Some(backup_dns)
        }
    }
}

/// Benchmark all DNS servers and return the fastest per region (CN + global).
pub async fn get_best_dns_per_region() -> (Option<String>, Option<String>) {
    let default_cn = "223.5.5.5".to_string();
    let default_global = "8.8.8.8".to_string();

    let cn_set: HashSet<&str> = CN_DNS_SERVERS.iter().cloned().collect();
    let global_set: HashSet<&str> = GLOBAL_DNS_SERVERS.iter().cloned().collect();

    let (tx, mut rx) = mpsc::channel::<(String, std::time::Duration)>(64);

    // Fire all probes in parallel
    for dns in DNSSERVERDICT {
        let dns = dns.to_string();
        let tx = tx.clone();
        tokio::spawn(async move {
            probe_dns_server(dns, Some(tx)).await;
        });
    }
    drop(tx);

    let mut cn_best: Option<(String, std::time::Duration)> = None;
    let mut global_best: Option<(String, std::time::Duration)> = None;

    while let Some((dns, latency)) = rx.recv().await {
        if cn_set.contains(dns.as_str()) {
            if cn_best.as_ref().map_or(true, |(_, l)| latency < *l) {
                cn_best = Some((dns, latency));
            }
        } else if global_set.contains(dns.as_str()) {
            if global_best.as_ref().map_or(true, |(_, l)| latency < *l) {
                global_best = Some((dns, latency));
            }
        }
    }

    let best_cn = cn_best.map(|(dns, lat)| {
        log::info!("✓ Best CN  DNS: {:<20} ({:?})", dns, lat);
        dns
    }).or_else(|| {
        log::info!("⚠ No CN DNS responded, using default: {}", default_cn);
        Some(default_cn)
    });

    let best_global = global_best.map(|(dns, lat)| {
        log::info!("✓ Best GLOBAL DNS: {:<20} ({:?})", dns, lat);
        dns
    }).or_else(|| {
        log::info!("⚠ No global DNS responded, using default: {}", default_global);
        Some(default_global)
    });

    (best_cn, best_global)
}

fn build_dns_a_query(hostname: &str) -> Option<Vec<u8>> {
    let mut payload = vec![
        0xAB, 0xCD, // Transaction ID
        0x01, 0x00, // Flags: standard query, recursion desired
        0x00, 0x01, // QDCOUNT = 1
        0x00, 0x00, // ANCOUNT = 0
        0x00, 0x00, // NSCOUNT = 0
        0x00, 0x00, // ARCOUNT = 0
    ];
    for label in hostname.split('.') {
        let bytes = label.as_bytes();
        if bytes.is_empty() || bytes.len() > 63 {
            return None;
        }
        payload.push(bytes.len() as u8);
        payload.extend_from_slice(bytes);
    }
    payload.push(0x00); // null terminator
    payload.extend_from_slice(&[0x00, 0x01]); // QTYPE = A
    payload.extend_from_slice(&[0x00, 0x01]); // QCLASS = IN
    Some(payload)
}

fn skip_dns_name(buf: &[u8], mut pos: usize) -> Option<usize> {
    loop {
        if pos >= buf.len() {
            return None;
        }
        let len = buf[pos] as usize;
        if len == 0 {
            return Some(pos + 1);
        }
        if (len & 0xC0) == 0xC0 {
            return Some(pos + 2);
        }
        pos += 1 + len;
    }
}

fn parse_dns_a_record(buf: &[u8]) -> Option<Ipv4Addr> {
    if buf.len() < 12 {
        return None;
    }
    let ancount = u16::from_be_bytes([buf[6], buf[7]]) as usize;
    if ancount == 0 {
        return None;
    }
    let mut pos = skip_dns_name(buf, 12)?;
    pos += 4; // QTYPE + QCLASS

    for _ in 0..ancount {
        pos = skip_dns_name(buf, pos)?;
        if pos + 10 > buf.len() {
            return None;
        }
        let rtype = u16::from_be_bytes([buf[pos], buf[pos + 1]]);
        let rdlength = u16::from_be_bytes([buf[pos + 8], buf[pos + 9]]) as usize;
        pos += 10;
        if rtype == 1 && rdlength == 4 && pos + 4 <= buf.len() {
            return Some(Ipv4Addr::new(
                buf[pos],
                buf[pos + 1],
                buf[pos + 2],
                buf[pos + 3],
            ));
        }
        pos += rdlength;
    }
    None
}

pub(crate) async fn resolve_a_record(hostname: &str, dns_server: &str) -> Option<Ipv4Addr> {
    let ns_addr: SocketAddr = format!("{}:53", dns_server).parse().ok()?;
    let bind_addr = if ns_addr.is_ipv4() {
        "0.0.0.0:0"
    } else {
        "[::]:0"
    };

    let payload = build_dns_a_query(hostname)?;
    let socket = UdpSocket::bind(bind_addr).await.ok()?;
    socket.connect(ns_addr).await.ok()?;
    socket.send(&payload).await.ok()?;

    let mut buf = [0u8; 512];
    let len = timeout(Duration::from_secs(5), socket.recv(&mut buf))
        .await
        .ok()? // timeout elapsed -> None
        .ok()?; // io::Error -> None

    parse_dns_a_record(&buf[..len])
}

#[allow(dead_code)]
fn _ipaddr_unused(_: IpAddr) {}

#[tauri::command]
pub async fn get_optimal_local_dns_server(app: AppHandle) -> Option<String> {
    use crate::app::state::AppData;
    use crate::engine::state_machine::{EngineState, EngineStateCell};

    let app_data = app.state::<AppData>();
    let running = matches!(
        app.state::<EngineStateCell>().snapshot(),
        EngineState::Running { .. }
    );

    if running {
        if let Some(cached) = app_data.get_cached_cn_dns() {
            log::info!("sing-box is running, using cached CN DNS: {}", cached);
            return Some(cached);
        }
    }

    log::info!("Benchmarking DNS servers for best CN + global...");
    let (best_cn, best_global) = get_best_dns_per_region().await;
    if let Some(ref dns) = best_cn {
        app_data.set_cached_cn_dns(Some(dns.clone()));
        log::info!("Cached best CN DNS: {}", dns);
    }
    if let Some(ref dns) = best_global {
        app_data.set_cached_global_dns(Some(dns.clone()));
        log::info!("Cached best global DNS: {}", dns);
    }
    best_cn
}

/// Returns the fastest globally-routed DNS server (for proxy DNS).
#[tauri::command]
pub async fn get_optimal_global_dns_server(app: AppHandle) -> Option<String> {
    use crate::app::state::AppData;
    use crate::engine::state_machine::{EngineState, EngineStateCell};

    let app_data = app.state::<AppData>();
    let running = matches!(
        app.state::<EngineStateCell>().snapshot(),
        EngineState::Running { .. }
    );

    if running {
        if let Some(cached) = app_data.get_cached_global_dns() {
            log::info!("sing-box is running, using cached global DNS: {}", cached);
            return Some(cached);
        }
    }

    log::info!("Benchmarking DNS servers for best global...");
    let (best_cn, best_global) = get_best_dns_per_region().await;
    if let Some(ref dns) = best_cn {
        app_data.set_cached_cn_dns(Some(dns.clone()));
    }
    if let Some(ref dns) = best_global {
        app_data.set_cached_global_dns(Some(dns.clone()));
        log::info!("Cached best global DNS: {}", dns);
    }
    best_global
}
