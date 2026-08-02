//! Node switching + traffic stats via Xray-core's own `api` CLI subcommand
//! (a thin wrapper Xray already ships around its gRPC control API — see
//! `main/commands/all/api/{balancer_override,stats_query}.go` upstream).
//!
//! Shelling out to the CLI instead of embedding a tonic/prost gRPC client
//! avoids a protoc build dependency for what's occasional calls (node
//! switch) and light periodic polling (traffic), not high-throughput
//! streaming — not worth the extra build-system surface.

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

const PROXY_BALANCER_TAG: &str = "proxy-balancer";

/// Tauri event carrying a `TrafficDelta` payload, emitted every
/// `TRAFFIC_POLL_INTERVAL` while the engine is Running. Replaces the
/// sing-box-era Clash-API traffic WebSocket (`src/utils/singbox-api/traffic.ts`).
pub const EVENT_TRAFFIC_TICK: &str = "traffic-tick";
const TRAFFIC_POLL_INTERVAL: std::time::Duration = std::time::Duration::from_secs(1);

static POLL_HANDLE: Mutex<Option<tokio::task::AbortHandle>> = Mutex::new(None);

/// Starts the traffic-polling loop (idempotent — cancels any prior instance
/// first, so it's safe to call on every start). Call once the engine
/// transitions to Running; `stop_traffic_poll` cancels it on termination.
pub fn spawn_traffic_poll(app: AppHandle) {
    stop_traffic_poll();
    let task = tokio::spawn(async move {
        loop {
            tokio::time::sleep(TRAFFIC_POLL_INTERVAL).await;
            match query_traffic_delta(&app).await {
                Ok(delta) => {
                    let _ = app.emit(EVENT_TRAFFIC_TICK, delta);
                }
                Err(e) => {
                    log::debug!("[traffic-poll] query failed: {}", e);
                }
            }
        }
    });
    let mut guard = POLL_HANDLE.lock().unwrap_or_else(|e| e.into_inner());
    *guard = Some(task.abort_handle());
}

/// Cancel the running traffic-poll loop if any. Idempotent.
pub fn stop_traffic_poll() {
    let mut guard = POLL_HANDLE.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(handle) = guard.take() {
        handle.abort();
    }
}

struct ApiCommandOutput {
    exit_code: Option<i32>,
    stdout: String,
    stderr: String,
}

/// Runs `aurestream-core api <args...>` and captures stdout/stderr separately
/// (unlike `config_check::verify`, callers here need to parse JSON from a
/// clean stdout rather than a combined stream).
async fn run_api_command(app: &AppHandle, args: &[&str]) -> Result<ApiCommandOutput, String> {
    let (mut rx, _child) = app
        .shell()
        .sidecar("aurestream-core")
        .map_err(|e| format!("sidecar lookup failed: {}", e))?
        .args(args)
        .spawn()
        .map_err(|e| format!("api command spawn failed: {}", e))?;

    let mut stdout = String::new();
    let mut stderr = String::new();
    let mut exit_code: Option<i32> = None;

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line) => stdout.push_str(&String::from_utf8_lossy(&line)),
            CommandEvent::Stderr(line) => stderr.push_str(&String::from_utf8_lossy(&line)),
            CommandEvent::Terminated(payload) => exit_code = payload.code,
            _ => {}
        }
    }

    Ok(ApiCommandOutput {
        exit_code,
        stdout,
        stderr,
    })
}

fn api_server_addr(app: &AppHandle) -> String {
    format!("127.0.0.1:{}", crate::engine::ports::api_port(app))
}

fn require_success(out: &ApiCommandOutput, context: &str) -> Result<(), String> {
    match out.exit_code {
        Some(0) => Ok(()),
        Some(code) => Err(if out.stderr.trim().is_empty() {
            format!("{} exited with code {}", context, code)
        } else {
            out.stderr.trim().to_string()
        }),
        None => Err(format!("{} terminated without exit code", context)),
    }
}

/// Live-switches the active proxy node without restarting the process, via
/// Xray's `RoutingService.OverrideBalancerTarget` (the `xray api bo` CLI).
/// Falls back to a full config regen + restart is the caller's
/// responsibility if this fails (mirrors the old Clash-API selector
/// behavior in `hot-reload-config.ts`).
pub async fn override_balancer(app: &AppHandle, node_tag: &str) -> Result<(), String> {
    let server = api_server_addr(app);
    let out = run_api_command(
        app,
        &["api", "bo", "-s", &server, "-b", PROXY_BALANCER_TAG, node_tag],
    )
    .await?;
    require_success(&out, "balancer override")
}

#[derive(Deserialize)]
struct StatEntry {
    name: String,
    #[serde(default)]
    value: i64,
}

#[derive(Deserialize, Default)]
struct QueryStatsResponse {
    #[serde(default)]
    stat: Vec<StatEntry>,
}

/// Traffic delta since the last poll (counters are reset on each query, so
/// this is a tick, not a running total — mirrors sing-box's Clash-API
/// traffic WebSocket).
#[derive(Clone, Copy, Default, Serialize)]
pub struct TrafficDelta {
    pub up: i64,
    pub down: i64,
}

/// Queries and resets Xray's inbound traffic counters (`policy.system.
/// statsInboundUplink/Downlink` must be enabled — see `xray-base-template.ts`).
/// Summing inbound (not outbound) counters gives total app traffic in one
/// query regardless of how many subscription nodes exist.
pub async fn query_traffic_delta(app: &AppHandle) -> Result<TrafficDelta, String> {
    let server = api_server_addr(app);
    let out = run_api_command(
        app,
        &[
            "api",
            "statsquery",
            "-s",
            &server,
            "-t",
            "2",
            "-pattern",
            "inbound>>>",
            "-reset",
        ],
    )
    .await?;
    require_success(&out, "statsquery")?;
    sum_traffic_stats(&out.stdout)
}

/// Parses `xray api statsquery`'s JSON output and sums uplink/downlink
/// across every stat entry matching the pattern. Split out from
/// `query_traffic_delta` so it's unit-testable without an `AppHandle`.
fn sum_traffic_stats(stdout: &str) -> Result<TrafficDelta, String> {
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return Ok(TrafficDelta::default());
    }
    let parsed: QueryStatsResponse = serde_json::from_str(trimmed)
        .map_err(|e| format!("failed to parse statsquery output: {} (output: {})", e, trimmed))?;

    let mut delta = TrafficDelta::default();
    for entry in parsed.stat {
        if entry.name.ends_with(">>>traffic>>>uplink") {
            delta.up += entry.value;
        } else if entry.name.ends_with(">>>traffic>>>downlink") {
            delta.down += entry.value;
        }
    }
    Ok(delta)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Real `xray api statsquery -pattern "outbound>>>" ` output captured
    /// against a live v26.3.27 instance (adapted to `inbound>>>` naming,
    /// same shape) — zero-value stats omit the `value` field entirely
    /// (proto3 JSON default-omission), which `sum_traffic_stats` must treat
    /// as 0, not fail to parse.
    const REAL_STATSQUERY_OUTPUT: &str = r#"{
    "stat": [
        {
            "name": "inbound>>>mixed-in>>>traffic>>>uplink",
            "value": 585
        },
        {
            "name": "inbound>>>mixed-in>>>traffic>>>downlink",
            "value": 4848
        },
        {
            "name": "inbound>>>tun-in>>>traffic>>>uplink"
        },
        {
            "name": "inbound>>>tun-in>>>traffic>>>downlink"
        }
    ]
}"#;

    #[test]
    fn sums_real_captured_statsquery_output() {
        let delta = sum_traffic_stats(REAL_STATSQUERY_OUTPUT).expect("should parse");
        assert_eq!(delta.up, 585);
        assert_eq!(delta.down, 4848);
    }

    #[test]
    fn empty_stdout_yields_zero_delta() {
        let delta = sum_traffic_stats("").expect("should parse");
        assert_eq!(delta.up, 0);
        assert_eq!(delta.down, 0);
    }

    #[test]
    fn empty_stat_array_yields_zero_delta() {
        let delta = sum_traffic_stats(r#"{"stat": []}"#).expect("should parse");
        assert_eq!(delta.up, 0);
        assert_eq!(delta.down, 0);
    }

    #[test]
    fn malformed_json_is_an_error_not_a_panic() {
        assert!(sum_traffic_stats("not json").is_err());
    }
}
