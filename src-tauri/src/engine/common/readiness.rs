use std::time::Duration;

use tauri::{AppHandle, Manager};
use tokio::net::TcpStream;
use tokio::time::{sleep, timeout, Instant};

use super::state_machine::{transition, EngineState, EngineStateCell, Intent};
use crate::core::controller_port;

const POLL_INTERVAL: Duration = Duration::from_millis(200);
const STARTUP_TIMEOUT: Duration = Duration::from_secs(20);
const PROBE_CONNECT_TIMEOUT: Duration = Duration::from_millis(150);

pub fn spawn(app: AppHandle, start_epoch: u64) {
    tokio::spawn(async move {
        let probe_port = controller_port(&app);
        let deadline = Instant::now() + STARTUP_TIMEOUT;
        loop {
            let snap = app.state::<EngineStateCell>().snapshot();
            if !matches!(snap, EngineState::Starting { .. }) || snap.epoch() != start_epoch {
                return;
            }

            if probe_controller_once(probe_port).await {
                let _ = transition(&app, Intent::MarkRunning);
                return;
            }

            if Instant::now() >= deadline {
                let _ = transition(
                    &app,
                    Intent::Fail {
                        reason: format!(
                            "startup timeout (controller 127.0.0.1:{probe_port} not ready)"
                        ),
                    },
                );
                return;
            }

            sleep(POLL_INTERVAL).await;
        }
    });
}

async fn probe_controller_once(port: u16) -> bool {
    let addr = format!("127.0.0.1:{}", port);
    matches!(
        timeout(PROBE_CONNECT_TIMEOUT, TcpStream::connect(addr)).await,
        Ok(Ok(_))
    )
}
