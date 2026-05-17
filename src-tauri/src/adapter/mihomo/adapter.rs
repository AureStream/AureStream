use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use async_trait::async_trait;

use crate::adapter::CoreControlPlane;
use crate::error::AppError;
use crate::models::{LatencySample, RuntimePolicy, RuntimeProfile, TrafficStats};

use super::api_client::MihomoApiClient;
use super::config_gen;

/// Mihomo 适配器骨架：**生成运行时 YAML** + **调用 External Controller**。
///
/// Sidecar 进程启动请复用或迁移 `commands::mihomo_kernel`，成功后调用 [`Self::set_sidecar_running`]。
pub struct MihomoAdapter {
    work_dir: PathBuf,
    runtime_file: &'static str,
    api: MihomoApiClient,
    /// 配置文件已就绪且 sidecar 已拉起时应为 true（由你在接线处设置）。
    sidecar_running: Arc<AtomicBool>,
}

impl MihomoAdapter {
    pub fn new(work_dir: PathBuf) -> Result<Self, AppError> {
        let api = MihomoApiClient::new(format!(
            "http://{}",
            super::constants::DEFAULT_EXTERNAL_CONTROLLER
        ))?;
        Ok(Self {
            work_dir,
            runtime_file: "aurestream-runtime.yaml",
            api,
            sidecar_running: Arc::new(AtomicBool::new(false)),
        })
    }

    pub fn runtime_config_path(&self) -> PathBuf {
        self.work_dir.join(self.runtime_file)
    }

    pub fn api_client(&self) -> &MihomoApiClient {
        &self.api
    }

    /// 与 `mihomo_kernel` / sidecar 接线完成后调用，影响 [`CoreControlPlane::is_running`] 与遥测请求。
    pub fn set_sidecar_running(&self, running: bool) {
        self.sidecar_running.store(running, Ordering::SeqCst);
    }
}

#[async_trait]
impl crate::adapter::CoreControlPlane for MihomoAdapter {
    async fn start(&self, profile: &RuntimeProfile) -> Result<(), AppError> {
        tokio::fs::create_dir_all(&self.work_dir)
            .await
            .map_err(AppError::Io)?;
        let yaml = config_gen::runtime_profile_to_yaml(profile)?;
        let path = self.runtime_config_path();
        tokio::fs::write(&path, yaml.as_bytes())
            .await
            .map_err(AppError::Io)?;
        tracing::info!(
            path = %path.display(),
            "已写入 Mihomo 运行时配置；请启动 sidecar（例如 `mihomo -d <work_dir> -f aurestream-runtime.yaml`）并调用 set_sidecar_running(true)"
        );
        Ok(())
    }

    async fn stop(&self) -> Result<(), AppError> {
        self.set_sidecar_running(false);
        Ok(())
    }

    async fn reload(&self, profile: &RuntimeProfile) -> Result<(), AppError> {
        self.start(profile).await?;
        // TODO: PUT /configs 或进程信号重载，依你采用的 Mihomo 版本而定
        Ok(())
    }

    async fn select_node(&self, node_id: &str) -> Result<(), AppError> {
        if !self.is_running() {
            return Err(AppError::CoreNotRunning);
        }
        let _ = node_id;
        Err(AppError::CoreApiError(
            "select_node：请将 node_id 映射为 Mihomo proxy 名后调用 PUT /proxies/AureStream_Node_Selector".into(),
        ))
    }

    async fn apply_policy(&self, policy: &RuntimePolicy) -> Result<(), AppError> {
        if !self.is_running() {
            return Err(AppError::CoreNotRunning);
        }
        let _ = policy;
        Err(AppError::CoreApiError(
            "apply_policy：请映射 RoutingMode → PATCH /configs 或等价 API".into(),
        ))
    }

    fn is_running(&self) -> bool {
        self.sidecar_running.load(Ordering::SeqCst)
    }

    fn core_type(&self) -> &str {
        "mihomo"
    }
}

#[async_trait]
impl crate::adapter::CoreTelemetryPlane for MihomoAdapter {
    async fn get_traffic(&self) -> Result<TrafficStats, AppError> {
        if !self.is_running() {
            return Err(AppError::CoreNotRunning);
        }
        self.api.traffic_stats().await
    }

    async fn test_latency(&self, node_id: &str) -> Result<LatencySample, AppError> {
        if !self.is_running() {
            return Err(AppError::CoreNotRunning);
        }
        Err(AppError::CoreApiError(format!(
            "test_latency：请将节点 `{node_id}` 映射为 Mihomo outbound 名并请求 /proxies/{{name}}/delay"
        )))
    }

    async fn test_all_latency(&self, node_ids: &[String]) -> Result<Vec<LatencySample>, AppError> {
        let _ = node_ids;
        Err(AppError::CoreApiError(
            "test_all_latency：请映射节点名后调用 Mihomo 组延迟或循环 /proxies/{{name}}/delay".into(),
        ))
    }
}
