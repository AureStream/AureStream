use std::time::Duration;

use tauri::{AppHandle, Manager};
use tokio::net::TcpStream;
use tokio::time::{sleep, timeout, Instant};

use super::state_machine::{transition, EngineState, EngineStateCell, Intent};

const POLL_INTERVAL: Duration = Duration::from_millis(200);
const STARTUP_TIMEOUT: Duration = Duration::from_secs(20);
const PROBE_ADDR: &str = "127.0.0.1:9191";
const PROBE_CONNECT_TIMEOUT: Duration = Duration::from_millis(150);

pub fn spawn(app: AppHandle, start_epoch: u64) {
    tokio::spawn(async move {
        let deadline = Instant::now() + STARTUP_TIMEOUT;
        loop {
            let snap = app.state::<EngineStateCell>().snapshot();
            if !matches!(snap, EngineState::Starting { .. }) || snap.epoch() != start_epoch {
                return;
            }

            if probe_once().await {
                let _ = transition(&app, Intent::MarkRunning);
                return;
            }

            if Instant::now() >= deadline {
                let _ = transition(
                    &app,
                    Intent::Fail {
                        reason: "startup timeout".into(),
                    },
                );
                return;
            }

            sleep(POLL_INTERVAL).await;
        }
    });
}

async fn probe_once() -> bool {
    matches!(
        timeout(PROBE_CONNECT_TIMEOUT, TcpStream::connect(PROBE_ADDR)).await,
        Ok(Ok(_))
    )
}
