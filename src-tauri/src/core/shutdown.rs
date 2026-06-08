use std::time::{Duration, Instant};

use tauri::AppHandle;

use crate::core::ports::{controller_port, mixed_proxy_port, wait_for_port_release};

const SIDECAR_PORT_RELEASE_TIMEOUT: Duration = Duration::from_secs(3);

/// After SIGTERM/kill, poll until mixed (and controller) proxy ports are free.
pub(crate) async fn wait_for_sidecar_ports_release(app: &AppHandle) {
    let started = Instant::now();
    let mixed = mixed_proxy_port(app);
    let mixed_ok =
        wait_for_port_release(mixed, SIDECAR_PORT_RELEASE_TIMEOUT).await;
    let mixed_ms = started.elapsed().as_millis();

    let ctrl = controller_port(app);
    let (ctrl_ok, ctrl_ms) = if ctrl != mixed {
        let ctrl_started = Instant::now();
        let remaining = SIDECAR_PORT_RELEASE_TIMEOUT.saturating_sub(started.elapsed());
        let ok = wait_for_port_release(ctrl, remaining).await;
        (ok, ctrl_started.elapsed().as_millis())
    } else {
        (true, 0)
    };

    if mixed_ok && ctrl_ok {
        if ctrl == mixed {
            log::info!(
                "[stop] proxy port :{mixed} released in {mixed_ms}ms"
            );
        } else {
            log::info!(
                "[stop] proxy ports released in {mixed_ms}ms (mixed :{mixed}) + {ctrl_ms}ms (controller :{ctrl})"
            );
        }
    } else {
        log::warn!(
            "[stop] proxy ports not fully released within {:?} (mixed :{mixed} ok={mixed_ok}, controller :{ctrl} ok={ctrl_ok})",
            SIDECAR_PORT_RELEASE_TIMEOUT
        );
    }
}
