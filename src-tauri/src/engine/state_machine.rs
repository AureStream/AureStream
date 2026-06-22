use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

pub const EVENT_ENGINE_STATE: &str = "engine-state";

#[derive(Serialize, Clone, Debug)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum EngineState {
    Idle {
        epoch: u64,
    },
    Starting {
        since: i64,
        epoch: u64,
        mode: String,
    },
    Running {
        since: i64,
        epoch: u64,
        mode: String,
    },
    Stopping {
        since: i64,
        epoch: u64,
    },
    /// Transient state while switching between TUN and SystemProxy modes.
    /// The sing-box process is being restarted with a new config.
    Switching {
        since: i64,
        epoch: u64,
        from_mode: String,
        to_mode: String,
    },
    Failed {
        reason: String,
        at: i64,
        epoch: u64,
    },
}

impl EngineState {
    pub fn kind(&self) -> &'static str {
        match self {
            EngineState::Idle { .. } => "idle",
            EngineState::Starting { .. } => "starting",
            EngineState::Running { .. } => "running",
            EngineState::Stopping { .. } => "stopping",
            EngineState::Switching { .. } => "switching",
            EngineState::Failed { .. } => "failed",
        }
    }

    pub fn epoch(&self) -> u64 {
        match self {
            EngineState::Idle { epoch }
            | EngineState::Starting { epoch, .. }
            | EngineState::Running { epoch, .. }
            | EngineState::Stopping { epoch, .. }
            | EngineState::Switching { epoch, .. }
            | EngineState::Failed { epoch, .. } => *epoch,
        }
    }
}

pub struct EngineStateCell {
    inner: Mutex<EngineState>,
    counter: AtomicU64,
}

impl EngineStateCell {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(EngineState::Idle { epoch: 0 }),
            counter: AtomicU64::new(0),
        }
    }

    pub fn snapshot(&self) -> EngineState {
        self.inner.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }
}

impl Default for EngineStateCell {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug)]
pub enum Intent {
    Start { mode: String },
    MarkRunning,
    Stop,
    MarkIdle,
    /// Mode switch while engine is running (fast restart path).
    SwitchMode { from: String, to: String },
    Fail { reason: String },
    ClearFailure,
}

fn now_secs() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

pub fn transition(app: &AppHandle, intent: Intent) -> Result<EngineState, String> {
    let cell = app.state::<EngineStateCell>();
    let mut guard = cell.inner.lock().unwrap_or_else(|e| e.into_inner());
    let current = guard.clone();

    let new_state = match (&current, intent) {
        (EngineState::Idle { .. }, Intent::Start { mode })
        | (EngineState::Failed { .. }, Intent::Start { mode }) => {
            let epoch = cell.counter.fetch_add(1, Ordering::SeqCst) + 1;
            EngineState::Starting {
                since: now_secs(),
                epoch,
                mode,
            }
        }
        (EngineState::Starting { mode, .. }, Intent::MarkRunning) => {
            let epoch = cell.counter.fetch_add(1, Ordering::SeqCst) + 1;
            EngineState::Running {
                since: now_secs(),
                epoch,
                mode: mode.clone(),
            }
        }
        (EngineState::Running { .. }, Intent::Stop) => {
            let epoch = cell.counter.fetch_add(1, Ordering::SeqCst) + 1;
            EngineState::Stopping {
                since: now_secs(),
                epoch,
            }
        }
        (EngineState::Running { .. }, Intent::SwitchMode { from, to }) => {
            let epoch = cell.counter.fetch_add(1, Ordering::SeqCst) + 1;
            EngineState::Switching {
                since: now_secs(),
                epoch,
                from_mode: from,
                to_mode: to,
            }
        }
        (EngineState::Switching { .. }, Intent::Start { mode }) => {
            // After switching stop phase, transition to Starting with the new mode.
            let epoch = cell.counter.fetch_add(1, Ordering::SeqCst) + 1;
            EngineState::Starting {
                since: now_secs(),
                epoch,
                mode,
            }
        }
        (
            EngineState::Stopping { .. }
            | EngineState::Starting { .. }
            | EngineState::Running { .. }
            | EngineState::Switching { .. },
            Intent::MarkIdle,
        ) => {
            let epoch = cell.counter.fetch_add(1, Ordering::SeqCst) + 1;
            EngineState::Idle { epoch }
        }
        (EngineState::Failed { .. }, Intent::ClearFailure) => {
            let epoch = cell.counter.fetch_add(1, Ordering::SeqCst) + 1;
            EngineState::Idle { epoch }
        }
        (cur, Intent::Fail { reason }) if !matches!(cur, EngineState::Idle { .. }) => {
            let epoch = cell.counter.fetch_add(1, Ordering::SeqCst) + 1;
            EngineState::Failed {
                reason,
                at: now_secs(),
                epoch,
            }
        }
        (cur, intent) => {
            let msg = format!("illegal transition from {} via {:?}", cur.kind(), intent);
            return Err(msg);
        }
    };

    *guard = new_state.clone();
    drop(guard);

    let _ = app.emit(EVENT_ENGINE_STATE, new_state.clone());

    // 刷新托盘菜单与 tooltip
    crate::app::tray::update_tray_menu(app);

    Ok(new_state)
}
