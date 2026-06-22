use std::time::Duration;

use tauri::{AppHandle, Manager};
use tokio::net::TcpStream;
use tokio::sync::broadcast;
use tokio::time::{sleep, timeout, Instant};

use crate::engine::ports::{controller_port, mixed_proxy_port};
use crate::engine::state_machine::{transition, EngineState, EngineStateCell, Intent};

const STARTUP_TIMEOUT: Duration = Duration::from_secs(15);
const PROBE_CONNECT_TIMEOUT: Duration = Duration::from_millis(50);
const POLL_INTERVAL: Duration = Duration::from_millis(50);

#[derive(Debug, Clone, Copy)]
pub enum Readiness {
    Ready,
    Failed,
}

static READY_SENDER: std::sync::OnceLock<broadcast::Sender<Readiness>> =
    std::sync::OnceLock::new();

/// Subscribe to a readiness signal before spawning sing-box. The signal fires
/// once when the readiness prober confirms ports are listening (or fails).
pub fn subscribe_ready() -> broadcast::Receiver<Readiness> {
    let sender = READY_SENDER.get_or_init(|| {
        broadcast::channel(1).0
    });
    sender.subscribe()
}

pub fn spawn(app: AppHandle, start_epoch: u64) {
    let sender = READY_SENDER.get_or_init(|| {
        broadcast::channel(1).0
    }).clone();

    tokio::spawn(async move {
        let mixed_port = mixed_proxy_port(&app);
        let controller = controller_port(&app);
        let started = Instant::now();
        let deadline = started + STARTUP_TIMEOUT;
        loop {
            let snap = app.state::<EngineStateCell>().snapshot();
            if !matches!(snap, EngineState::Starting { .. }) || snap.epoch() != start_epoch {
                // State was changed externally (e.g. handle_process_termination
                // transitioned to Failed after a BIND error). Signal the waiter
                // so start() can return immediately instead of timing out.
                let _ = sender.send(Readiness::Failed);
                return;
            }

            if probe_ports_once(mixed_port, controller).await {
                log::info!(
                    "[readiness] probe succeeded in {}ms (mixed :{mixed_port}, controller :{controller})",
                    started.elapsed().as_millis()
                );
                let _ = transition(&app, Intent::MarkRunning);
                let _ = sender.send(Readiness::Ready);
                return;
            }

            if Instant::now() >= deadline {
                let reason = format!(
                    "startup timeout (127.0.0.1:{mixed_port} / :{controller} not ready)"
                );
                let _ = transition(&app, Intent::Fail { reason: reason.clone() });
                let _ = sender.send(Readiness::Failed);
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
    if !probe_port_once(mixed_port).await {
        return false;
    }
    if controller_port != mixed_port && !probe_port_once(controller_port).await {
        return false;
    }
    true
}
