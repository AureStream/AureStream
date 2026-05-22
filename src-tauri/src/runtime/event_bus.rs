use tokio::sync::broadcast;

use crate::models::AppEvent;

/// 双通道事件总线（控制 / 遥测）。
#[allow(dead_code)]
pub struct EventBus {
    control: broadcast::Sender<AppEvent>,
    telemetry: broadcast::Sender<AppEvent>,
}

#[allow(dead_code)]
impl EventBus {
    pub fn new(control_cap: usize, telemetry_cap: usize) -> Self {
        let (control, _) = broadcast::channel(control_cap);
        let (telemetry, _) = broadcast::channel(telemetry_cap);
        Self { control, telemetry }
    }

    pub fn publish(&self, ev: AppEvent) {
        let tx = if ev.is_telemetry() {
            &self.telemetry
        } else {
            &self.control
        };
        let _ = tx.send(ev);
    }
}
