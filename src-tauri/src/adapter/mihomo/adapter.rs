use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use async_trait::async_trait;

use crate::adapter::CoreControlPlane;
use crate::error::AppError;
use crate::models::{LatencySample, RuntimePolicy, RuntimeProfile, RoutingMode, TrafficStats};

use super::api_client::MihomoApiClient;
use super::config_gen;
use super::constants::{EXTERNAL_CONTROLLER, LATENCY_TEST_URL};

/// Mihomo 适配器：**生成运行时 YAML** + **调用 External Controller**。
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
        let api = MihomoApiClient::new(format!("http://{EXTERNAL_CONTROLLER}"))?;
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

    /// 生成完整运行时配置（含 proxy-providers、geox-url、routing rules）并写入磁盘。
    ///
    /// - `subscription_file`: 原始订阅 YAML 路径
    /// - `provider_id`: 订阅 ID（用于复制到 work_dir）
    /// - `profile`: 运行时配置
    pub async fn build_and_write_config(
        &self,
        subscription_file: &std::path::Path,
        provider_id: &str,
        profile: &RuntimeProfile,
    ) -> Result<PathBuf, AppError> {
        tokio::fs::create_dir_all(&self.work_dir)
            .await
            .map_err(AppError::Io)?;

        // 复制订阅到 mihomo 工作目录，配置内使用相对 `-d` 的路径
        let sub_path_rel_home =
            config_gen::mirror_subscription_to_workdir(subscription_file, &self.work_dir, provider_id)
                .await?;

        // 生成完整配置
        let yaml = config_gen::generate_full_config(&sub_path_rel_home, profile)?;
        let path = self.runtime_config_path();
        tokio::fs::write(&path, yaml.as_bytes())
            .await
            .map_err(AppError::Io)?;

        tracing::info!(path = %path.display(), "已写入 Mihomo 完整运行时配置");
        Ok(path)
    }
}

#[async_trait]
impl crate::adapter::CoreControlPlane for MihomoAdapter {
    async fn start(&self, profile: &RuntimeProfile) -> Result<(), AppError> {
        tokio::fs::create_dir_all(&self.work_dir)
            .await
            .map_err(AppError::Io)?;

        // 生成骨架配置（无 subscription file 时的 fallback）
        let yaml = config_gen::generate_full_config("", profile)?;
        let path = self.runtime_config_path();
        tokio::fs::write(&path, yaml.as_bytes())
            .await
            .map_err(AppError::Io)?;
        tracing::info!(
            path = %path.display(),
            "已写入 Mihomo 运行时配置（骨架模式，无 subscription provider）"
        );
        Ok(())
    }

    async fn stop(&self) -> Result<(), AppError> {
        self.set_sidecar_running(false);
        Ok(())
    }

    async fn reload(&self, profile: &RuntimeProfile) -> Result<(), AppError> {
        self.start(profile).await?;
        // TODO: PUT /configs 进行热重载
        Ok(())
    }

    async fn select_node(&self, node_id: &str) -> Result<(), AppError> {
        if !self.is_running() {
            return Err(AppError::CoreNotRunning);
        }
        // node_id 即 Mihomo proxy 名称，直接切换 selector
        self.api
            .switch_node(super::constants::AURESTREAM_NODE_SELECTOR, node_id)
            .await
    }

    async fn apply_policy(&self, policy: &RuntimePolicy) -> Result<(), AppError> {
        if !self.is_running() {
            return Err(AppError::CoreNotRunning);
        }
        let mode = match policy.routing_mode {
            RoutingMode::RuleBased => "rule",
            RoutingMode::FullTunnel => "global",
            RoutingMode::Direct => "direct",
        };
        self.api.set_mode(mode).await
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
        match self
            .api
            .test_node_delay(node_id, LATENCY_TEST_URL, 5000)
            .await
        {
            Ok(delay) => Ok(LatencySample {
                node_id: node_id.to_string(),
                delay: Some(delay),
                error: None,
            }),
            Err(e) => Ok(LatencySample {
                node_id: node_id.to_string(),
                delay: None,
                error: Some(e.to_string()),
            }),
        }
    }

    async fn test_all_latency(&self, node_ids: &[String]) -> Result<Vec<LatencySample>, AppError> {
        let mut results = Vec::with_capacity(node_ids.len());
        for node_id in node_ids {
            results.push(self.test_latency(node_id).await?);
        }
        Ok(results)
    }
}
