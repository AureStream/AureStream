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
            EngineState::Failed { .. } => "failed",
        }
    }

    pub fn epoch(&self) -> u64 {
        match self {
            EngineState::Idle { epoch }
            | EngineState::Starting { epoch, .. }
            | EngineState::Running { epoch, .. }
            | EngineState::Stopping { epoch, .. }
            | EngineState::Failed { epoch, .. } => *epoch,
        }
    }

    pub fn mode(&self) -> Option<&str> {
        match self {
            EngineState::Starting { mode, .. } | EngineState::Running { mode, .. } => {
                Some(mode.as_str())
            }
            _ => None,
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

    pub fn current_epoch(&self) -> u64 {
        self.counter.load(Ordering::SeqCst)
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
    Fail { reason: String },
    RollbackToRunning { mode: String },
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
        (
            EngineState::Stopping { .. }
            | EngineState::Starting { .. }
            | EngineState::Running { .. },
            Intent::MarkIdle,
        ) => {
            let epoch = cell.counter.fetch_add(1, Ordering::SeqCst) + 1;
            EngineState::Idle { epoch }
        }
        (EngineState::Failed { .. }, Intent::ClearFailure) => {
            let epoch = cell.counter.fetch_add(1, Ordering::SeqCst) + 1;
            EngineState::Idle { epoch }
        }
        (EngineState::Stopping { .. }, Intent::RollbackToRunning { mode }) => {
            let epoch = cell.counter.fetch_add(1, Ordering::SeqCst) + 1;
            EngineState::Running {
                since: now_secs(),
                epoch,
                mode,
            }
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

    Ok(new_state)
}
