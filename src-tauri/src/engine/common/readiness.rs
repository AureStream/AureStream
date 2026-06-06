use std::time::Duration;

use tauri::{AppHandle, Manager};
use tokio::net::TcpStream;
use tokio::time::{sleep, timeout, Instant};

use super::state_machine::{transition, EngineState, EngineStateCell, Intent};
use crate::core::{controller_port, mixed_proxy_port};

const STARTUP_TIMEOUT: Duration = Duration::from_secs(20);
const PROBE_CONNECT_TIMEOUT: Duration = Duration::from_millis(100);
const POLL_INTERVAL: Duration = Duration::from_millis(100);

pub fn spawn(app: AppHandle, start_epoch: u64) {
    tokio::spawn(async move {
        let mixed_port = mixed_proxy_port(&app);
        let controller = controller_port(&app);
        let started = Instant::now();
        let deadline = started + STARTUP_TIMEOUT;
        loop {
            let snap = app.state::<EngineStateCell>().snapshot();
            if !matches!(snap, EngineState::Starting { .. }) || snap.epoch() != start_epoch {
                return;
            }

            if probe_ports_once(mixed_port, controller).await {
                log::info!(
                    "[readiness] probe succeeded in {}ms (mixed :{mixed_port}, controller :{controller})",
                    started.elapsed().as_millis()
                );
                let _ = transition(&app, Intent::MarkRunning);
                return;
            }

            if Instant::now() >= deadline {
                let _ = transition(
                    &app,
                    Intent::Fail {
                        reason: format!(
                            "startup timeout (127.0.0.1:{mixed_port} / :{controller} not ready)"
                        ),
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

async fn probe_ports_once(mixed_port: u16, controller_port: u16) -> bool {
    if probe_port_once(mixed_port).await {
        return true;
    }
    if controller_port != mixed_port && probe_port_once(controller_port).await {
        return true;
    }
    false
}
