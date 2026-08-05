//! Engine lifecycle states and transition guard.

use std::fmt;

use crate::EngineError;

/// Public engine lifecycle for UI / IPC.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EngineState {
    Idle,
    Starting,
    Running,
    Stopping,
    Failed { reason: String },
}

impl EngineState {
    pub fn kind(&self) -> &'static str {
        match self {
            EngineState::Idle => "idle",
            EngineState::Starting => "starting",
            EngineState::Running => "running",
            EngineState::Stopping => "stopping",
            EngineState::Failed { .. } => "failed",
        }
    }
}

impl fmt::Display for EngineState {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            EngineState::Failed { reason } => write!(f, "failed({reason})"),
            other => write!(f, "{}", other.kind()),
        }
    }
}

/// Guarded state machine: Idle → Starting → Running → Stopping → Idle (+ Failed).
#[derive(Debug, Clone)]
pub struct StateMachine {
    state: EngineState,
}

impl StateMachine {
    pub fn new() -> Self {
        Self {
            state: EngineState::Idle,
        }
    }

    pub fn state(&self) -> EngineState {
        self.state.clone()
    }

    /// Test / recovery helper: set state without validating the edge.
    pub fn force(&mut self, state: EngineState) {
        self.state = state;
    }

    pub fn transition(&mut self, next: EngineState) -> Result<(), EngineError> {
        if Self::is_legal(&self.state, &next) {
            self.state = next;
            Ok(())
        } else {
            Err(EngineError::illegal_transition(
                self.state.kind(),
                next.kind(),
            ))
        }
    }

    fn is_legal(from: &EngineState, to: &EngineState) -> bool {
        match (from, to) {
            (EngineState::Idle | EngineState::Failed { .. }, EngineState::Starting) => true,
            (EngineState::Starting, EngineState::Running) => true,
            (EngineState::Running, EngineState::Stopping) => true,
            (EngineState::Stopping, EngineState::Idle) => true,
            (
                EngineState::Starting | EngineState::Running | EngineState::Stopping,
                EngineState::Failed { .. },
            ) => true,
            (EngineState::Failed { .. }, EngineState::Idle) => true,
            _ => false,
        }
    }
}

impl Default for StateMachine {
    fn default() -> Self {
        Self::new()
    }
}
