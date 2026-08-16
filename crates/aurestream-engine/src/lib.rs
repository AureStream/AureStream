//! AureStream engine: trait, state machine, Xray dialect + sidecar.

mod state;
mod xray;

pub use state::{EngineState, StateMachine};
pub use xray::{
    resolve_asset_dir, resolve_sidecar_path, BuildOptions, SharedXrayEngine, XrayEngine,
};

use std::fmt;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use async_trait::async_trait;
use aurestream_config::ProxyNode;
use tokio::sync::broadcast;

/// Stable identifier for an installed proxy kernel implementation.
///
/// This is a newtype rather than an enum so adding another kernel does not
/// require downstream exhaustive matches to change.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct KernelId(&'static str);

impl KernelId {
    pub const XRAY: Self = Self("xray");

    pub const fn new(id: &'static str) -> Self {
        Self(id)
    }

    pub const fn as_str(self) -> &'static str {
        self.0
    }
}

impl fmt::Display for KernelId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.0)
    }
}

/// Everything the privileged capture layer needs to launch a kernel.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KernelLaunchSpec {
    pub id: KernelId,
    pub config_filename: &'static str,
    pub executable: PathBuf,
    pub asset_dir: Option<PathBuf>,
}

/// Details captured when an engine-owned process exits without an explicit stop.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EngineExitEvent {
    pub generation: u64,
    pub code: Option<i32>,
    pub reason: String,
}

/// Byte counters reported by a proxy kernel for one outbound.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct TrafficStats {
    pub upload: u64,
    pub download: u64,
}

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
            message: format!("illegal transition from {} to {}", from.into(), to.into()),
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

/// Proxy kernel abstraction. MVP: [`XrayEngine`]. Future kernels implement
/// this boundary and are selected by the application factory.
#[async_trait]
pub trait Engine: Send + Sync {
    /// Config filename used in the app data directory. This must not perform IO.
    fn config_filename(&self) -> &'static str;

    /// Resolve the executable, assets and config filename for external launch.
    fn launch_spec(&self) -> Result<KernelLaunchSpec, EngineError>;

    fn build_config(
        &self,
        path: &Path,
        node: &ProxyNode,
        socks_port: u16,
        api_port: u16,
    ) -> Result<(), EngineError> {
        self.build_config_with_options(path, node, BuildOptions::system_proxy(socks_port, api_port))
    }

    fn build_config_with_options(
        &self,
        path: &Path,
        node: &ProxyNode,
        opts: BuildOptions,
    ) -> Result<(), EngineError>;

    async fn start(&self, config: &Path) -> Result<(), EngineError>;

    async fn stop(&self) -> Result<(), EngineError>;

    /// Return cumulative counters for one proxy outbound in the current session.
    async fn query_outbound_traffic(&self, outbound_tag: &str)
        -> Result<TrafficStats, EngineError>;

    fn state(&self) -> EngineState;

    /// Subscribe to unexpected exits of engine-owned processes.
    fn subscribe_exit_events(&self) -> broadcast::Receiver<EngineExitEvent>;

    /// Begin an externally-owned start (for example an elevated TUN helper).
    fn begin_external_start(&self, socks_port: u16, api_port: u16) -> Result<(), EngineError>;

    /// Mark an externally-owned kernel ready.
    fn finish_external_start(&self) -> Result<(), EngineError>;

    /// Mark an externally-owned start failed.
    fn fail_external_start(&self, reason: String) -> Result<(), EngineError>;

    /// Return to idle after an externally-owned kernel has stopped.
    fn finish_external_stop(&self) -> Result<(), EngineError>;
}

/// Kernel-neutral shared engine handle used by the application shell.
pub type SharedEngine = Arc<dyn Engine>;
