//! 内核适配层：抽象 Mihomo / 未来 sing-box 等。
//!
//! - [`CoreControlPlane`]：生命周期与策略
//! - [`CoreTelemetryPlane`]：流量与延迟
//! - [`CoreAdapter`]：二者组合

pub mod mihomo;

use async_trait::async_trait;

use crate::error::AppError;
use crate::models::{LatencySample, RuntimePolicy, RuntimeProfile, TrafficStats};

pub use mihomo::MihomoAdapter;

#[async_trait]
pub trait CoreControlPlane: Send + Sync {
    async fn start(&self, profile: &RuntimeProfile) -> Result<(), AppError>;
    async fn stop(&self) -> Result<(), AppError>;
    async fn reload(&self, profile: &RuntimeProfile) -> Result<(), AppError>;
    async fn select_node(&self, node_id: &str) -> Result<(), AppError>;
    async fn apply_policy(&self, policy: &RuntimePolicy) -> Result<(), AppError>;
    fn is_running(&self) -> bool;
    fn core_type(&self) -> &str;
}

#[async_trait]
pub trait CoreTelemetryPlane: Send + Sync {
    async fn get_traffic(&self) -> Result<TrafficStats, AppError>;
    async fn test_latency(&self, node_id: &str) -> Result<LatencySample, AppError>;
    async fn test_all_latency(&self, node_ids: &[String]) -> Result<Vec<LatencySample>, AppError>;
}

pub trait CoreAdapter: CoreControlPlane + CoreTelemetryPlane {}

impl<T: CoreControlPlane + CoreTelemetryPlane> CoreAdapter for T {}

/// 占位适配器：接线完成前可用于编译与 RuntimeManager 联调。
pub struct NoopCoreAdapter;

#[async_trait]
impl CoreControlPlane for NoopCoreAdapter {
    async fn start(&self, _profile: &RuntimeProfile) -> Result<(), AppError> {
        Err(AppError::CoreStartFailed(
            "NoopCoreAdapter：请替换为 MihomoAdapter".into(),
        ))
    }

    async fn stop(&self) -> Result<(), AppError> {
        Ok(())
    }

    async fn reload(&self, _profile: &RuntimeProfile) -> Result<(), AppError> {
        Ok(())
    }

    async fn select_node(&self, _node_id: &str) -> Result<(), AppError> {
        Err(AppError::CoreNotRunning)
    }

    async fn apply_policy(&self, _policy: &RuntimePolicy) -> Result<(), AppError> {
        Err(AppError::CoreNotRunning)
    }

    fn is_running(&self) -> bool {
        false
    }

    fn core_type(&self) -> &str {
        "noop"
    }
}

#[async_trait]
impl CoreTelemetryPlane for NoopCoreAdapter {
    async fn get_traffic(&self) -> Result<TrafficStats, AppError> {
        Err(AppError::CoreNotRunning)
    }

    async fn test_latency(&self, _node_id: &str) -> Result<LatencySample, AppError> {
        Err(AppError::CoreNotRunning)
    }

    async fn test_all_latency(&self, _node_ids: &[String]) -> Result<Vec<LatencySample>, AppError> {
        Err(AppError::CoreNotRunning)
    }
}
