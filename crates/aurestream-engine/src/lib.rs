//! AureStream engine: trait, state machine, Xray dialect + sidecar.

mod state;
mod xray;

pub use state::{EngineState, StateMachine};
pub use xray::{resolve_asset_dir, resolve_sidecar_path, SharedXrayEngine, XrayEngine};

use std::fmt;
use std::path::Path;

use aurestream_config::ProxyNode;

/// Errors from config dialect, spawn, or illegal state transitions.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EngineError {
    kind: EngineErrorKind,
    message: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum EngineErrorKind {
    Config,
    Io,
    IllegalTransition,
    NotReady,
}

impl EngineError {
    pub fn config(message: impl Into<String>) -> Self {
        Self {
            kind: EngineErrorKind::Config,
            message: message.into(),
        }
    }

    pub fn io(message: impl Into<String>) -> Self {
        Self {
            kind: EngineErrorKind::Io,
            message: message.into(),
        }
    }

    pub fn illegal_transition(from: impl Into<String>, to: impl Into<String>) -> Self {
        Self {
            kind: EngineErrorKind::IllegalTransition,
            message: format!(
                "illegal transition from {} to {}",
                from.into(),
                to.into()
            ),
        }
    }

    pub fn not_ready(message: impl Into<String>) -> Self {
        Self {
            kind: EngineErrorKind::NotReady,
            message: message.into(),
        }
    }

    pub fn message(&self) -> &str {
        &self.message
    }
}

impl fmt::Display for EngineError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for EngineError {}

/// Proxy kernel abstraction. MVP: [`XrayEngine`]. Future: SingboxEngine.
pub trait Engine: Send {
    fn build_config(
        &self,
        path: &Path,
        node: &ProxyNode,
        socks_port: u16,
        api_port: u16,
    ) -> Result<(), EngineError>;

    fn start(
        &self,
        config: &Path,
    ) -> impl std::future::Future<Output = Result<(), EngineError>> + Send;

    fn stop(&self) -> impl std::future::Future<Output = Result<(), EngineError>> + Send;

    fn state(&self) -> EngineState;
}
