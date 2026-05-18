use tokio::sync::broadcast;

use crate::models::AppEvent;

/// 双通道事件总线（控制 / 遥测）。
pub struct EventBus {
    control: broadcast::Sender<AppEvent>,
    telemetry: broadcast::Sender<AppEvent>,
}

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

    /// 订阅控制频道（低频：连接状态、内核启停、错误）。
    pub fn subscribe_control(&self) -> broadcast::Receiver<AppEvent> {
        self.control.subscribe()
    }

    /// 订阅遥测频道（高频：流量、延迟、内核日志）。
    pub fn subscribe_telemetry(&self) -> broadcast::Receiver<AppEvent> {
        self.telemetry.subscribe()
    }
}
