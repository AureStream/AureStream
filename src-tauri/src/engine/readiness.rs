use std::time::Duration;

use tauri::{AppHandle, Manager};
use tokio::net::TcpStream;
use tokio::time::{sleep, timeout, Instant};

use crate::engine::ports::controller_port;
use crate::engine::state_machine::{transition, EngineState, EngineStateCell, Intent};

pub(crate) const STARTUP_TIMEOUT: Duration = Duration::from_secs(20);
const PROBE_CONNECT_TIMEOUT: Duration = Duration::from_millis(100);
const POLL_INTERVAL: Duration = Duration::from_millis(100);

pub fn spawn(app: AppHandle, start_epoch: u64) {
    tokio::spawn(async move {
        let controller = controller_port(&app);
        let started = Instant::now();
        let deadline = started + STARTUP_TIMEOUT;
        loop {
            let snap = app.state::<EngineStateCell>().snapshot();
            if !matches!(snap, EngineState::Starting { .. }) || snap.epoch() != start_epoch {
                // State was changed externally (e.g. handle_process_termination
                // transitioned to Failed after a BIND error) or a newer start
                // superseded this prober.
                log::debug!(
                    "[readiness] superseded (kind={}, epoch={}, captured={}), exiting",
                    snap.kind(),
                    snap.epoch(),
                    start_epoch
                );
                return;
            }

            if probe_port_once(controller).await {
                log::info!(
                    "[readiness] probe succeeded in {}ms (controller :{controller})",
                    started.elapsed().as_millis()
                );
                let _ = transition(&app, Intent::MarkRunning);
                return;
            }

            if Instant::now() >= deadline {
                let elapsed_ms = started.elapsed().as_millis();
                let reason = format!(
                    "startup timeout after {elapsed_ms}ms (127.0.0.1:{controller} not ready)"
                );
                log::warn!("[readiness] {reason}");
                let _ = transition(
                    &app,
                    Intent::Fail {
                        reason: reason.clone(),
                    },
                );
                return;
            }

            sleep(POLL_INTERVAL).await;
        }
    });
}

async fn probe_port_once(port: u16) -> bool {
    let addr = format!("127.0.0.1:{}", port);
    matches!(
        timeout(PROBE_CONNECT_TIMEOUT, TcpStream::connect(addr)).await,
        Ok(Ok(_))
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn startup_timeout_covers_slow_rule_set_updates() {
        assert_eq!(STARTUP_TIMEOUT, Duration::from_secs(20));
        assert_eq!(POLL_INTERVAL, Duration::from_millis(100));
        assert_eq!(PROBE_CONNECT_TIMEOUT, Duration::from_millis(100));
    }
}
