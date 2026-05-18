//! Mihomo sidecar 进程：`spawn` / `stop`。
//! 由 [`crate::runtime::RuntimeManager`] 持有。

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{AppHandle, Manager};
use tauri_plugin_shell::{process::CommandEvent, ShellExt};
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;

use crate::adapter::mihomo::constants::EXTERNAL_CONTROLLER;
use crate::models::proxy_config::ProxyConfig;

pub(crate) struct MihomoChild {
    pub(crate) child: tauri_plugin_shell::process::CommandChild,
}

pub struct MihomoSidecar {
    pub(crate) inner: Mutex<Option<MihomoChild>>,
    pub(crate) system_proxy_managed: AtomicBool,
}

impl Default for MihomoSidecar {
    fn default() -> Self {
        Self {
            inner: Mutex::new(None),
            system_proxy_managed: AtomicBool::new(false),
        }
    }
}

impl MihomoSidecar {
    async fn wait_for_controller_ready() -> Result<(), String> {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(2))
            .no_proxy()
            .build()
            .map_err(|e| format!("构建 HTTP 客户端失败: {}", e))?;

        tokio::time::sleep(std::time::Duration::from_millis(300)).await;

        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(90);

        tracing::info!(
            "[mihomo] sidecar 已 spawn，等待 External Controller 就绪（最长 90s，首启下载规则库可能较慢）"
        );

        loop {
            if std::time::Instant::now() >= deadline {
                break;
            }
            match client.get(format!("http://{EXTERNAL_CONTROLLER}/version")).send().await {
                Ok(r) if r.status().is_success() => {
                    tracing::info!("[mihomo] External Controller 已就绪");
                    return Ok(());
                }
                _ => tokio::time::sleep(std::time::Duration::from_millis(250)).await,
            }
        }

        tracing::error!(
            "[mihomo] 等待 127.0.0.1:9090/version 超时（90s），侧进程已终止。请查看应用日志目录中的 mihomo.log"
        );

        Err(
            "等待 Mihomo API 就绪超时（已轮询约 90 秒）。常见原因：1）首次启动需下载 GEOIP/GEOSITE，耗时较长；2）127.0.0.1:9090 被占用；3）配置或订阅 YAML 有误导致内核退出——请查看日志目录 mihomo.log。"
                .to_string(),
        )
    }

    /// 使用外部生成的运行时 YAML（如 `build_runtime_config`）启动 sidecar。
    pub async fn spawn_with_config_file(
        &self,
        app: &AppHandle,
        config_path: PathBuf,
        proxy_cfg_on_ready: ProxyConfig,
    ) -> Result<(), String> {
        let t0 = std::time::Instant::now();
        tracing::debug!("[mihomo.startup] 开始启动 sidecar");

        if !config_path.is_file() {
            return Err("运行配置不存在".into());
        }

        let work_dir = app
            .path()
            .app_local_data_dir()
            .map_err(|e| format!("无法获取本地数据目录: {}", e))?
            .join(crate::adapter::mihomo::constants::MIHOMO_WORK_DIR);
        tokio::fs::create_dir_all(&work_dir)
            .await
            .map_err(|e| format!("创建工作目录失败: {}", e))?;
        let providers_cache = work_dir.join("providers");
        tokio::fs::create_dir_all(&providers_cache)
            .await
            .map_err(|e| format!("创建 providers 缓存目录失败: {}", e))?;

        {
            let mut guard = self.inner.lock().await;
            if let Some(MihomoChild { child }) = guard.take() {
                tracing::debug!("[mihomo.startup] 终止已有 sidecar 进程");
                let _ = child.kill();
            }
        }
        tracing::debug!("[mihomo.startup] 工作目录准备完成 ({:.0}ms)", t0.elapsed().as_millis());

        let t_spawn = std::time::Instant::now();

        let cfg_str = config_path
            .to_str()
            .ok_or_else(|| "配置路径含非法字符".to_string())?
            .to_string();
        let work_str = work_dir
            .to_str()
            .ok_or_else(|| "工作目录路径含非法字符".to_string())?
            .to_string();

        let sidecar = app
            .shell()
            .sidecar("mihomo")
            .map_err(|e| {
                format!(
                    "加载 Mihomo sidecar 失败: {}（开发环境请确认已下载 binaries）",
                    e
                )
            })?
            .args(["-f", &cfg_str, "-d", &work_str]);

        let (mut rx, child) = sidecar
            .spawn()
            .map_err(|e| {
                tracing::error!("[mihomo] spawn 失败: {}", e);
                format!("启动 Mihomo 进程失败: {}", e)
            })?;
        tracing::debug!("[mihomo.startup] sidecar spawn 完成 ({:.0}ms)", t_spawn.elapsed().as_millis());

        let mihomo_log_dir = app
            .path()
            .app_log_dir()
            .map_err(|e| format!("无法获取日志目录: {}", e))?;
        let _ = tokio::fs::create_dir_all(&mihomo_log_dir).await;
        let mihomo_log_file = mihomo_log_dir.join("mihomo.log");

        tauri::async_runtime::spawn(async move {
            let mut log_file = tokio::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&mihomo_log_file)
                .await
                .ok();

            while let Some(event) = rx.recv().await {
                match event {
                    CommandEvent::Stderr(line) => {
                        let text = String::from_utf8_lossy(&line);
                        if let Some(ref mut f) = log_file {
                            let _ = f.write_all(format!("[stderr] {}\n", text).as_bytes()).await;
                        }
                    }
                    CommandEvent::Stdout(line) => {
                        let text = String::from_utf8_lossy(&line);
                        if let Some(ref mut f) = log_file {
                            let _ = f.write_all(format!("[stdout] {}\n", text).as_bytes()).await;
                        }
                    }
                    CommandEvent::Error(err) => {
                        if let Some(ref mut f) = log_file {
                            let _ = f.write_all(format!("[error] {}\n", err).as_bytes()).await;
                        }
                    }
                    _ => {}
                }
            }
        });

        {
            let mut guard = self.inner.lock().await;
            *guard = Some(MihomoChild { child });
        }

        if let Err(e) = Self::wait_for_controller_ready().await {
            tracing::error!("[mihomo] 就绪等待失败: {}", e);
            let mut guard = self.inner.lock().await;
            if let Some(MihomoChild { child }) = guard.take() {
                let _ = child.kill();
            }
            return Err(e);
        }
        tracing::debug!("[mihomo.startup] controller 就绪 ({:.0}ms)", t0.elapsed().as_millis());

        let t_proxy = std::time::Instant::now();
        match tokio::task::spawn_blocking(move || {
            crate::network::system_proxy::apply_platform(&proxy_cfg_on_ready)
        })
        .await
        {
            Ok(Ok(())) => {
                self.system_proxy_managed.store(true, Ordering::SeqCst);
                tracing::debug!("[mihomo.startup] 系统代理设置完成 ({:.0}ms)", t_proxy.elapsed().as_millis());
            }
            Ok(Err(err)) => {
                tracing::warn!(
                    "[system-proxy] 未能启用系统代理: {}（Mihomo 已运行，可在系统设置中手动配置）",
                    err
                );
            }
            Err(join_err) => tracing::error!("[system-proxy] 启用任务失败: {:?}", join_err),
        }

        tracing::debug!("[mihomo.startup] 启动完成，总耗时 {:.0}ms", t0.elapsed().as_millis());
        Ok(())
    }

    pub async fn stop_kill(&self) -> Result<(), String> {
        let kill_result = {
            let mut guard = self.inner.lock().await;
            if let Some(MihomoChild { child }) = guard.take() {
                child
                    .kill()
                    .map_err(|e| format!("终止 Mihomo 进程失败: {}", e))
            } else {
                Ok(())
            }
        };

        if kill_result.is_ok() && self.system_proxy_managed.load(Ordering::SeqCst) {
            match tokio::task::spawn_blocking(|| crate::network::system_proxy::clear_platform()).await
            {
                Ok(Ok(())) => {
                    self.system_proxy_managed.store(false, Ordering::SeqCst);
                }
                Ok(Err(e)) => tracing::warn!(
                    "[system-proxy] 关闭系统代理失败: {}（请在系统「网络」设置中手动关闭代理）",
                    e
                ),
                Err(e) => tracing::error!("[system-proxy] 清除系统代理任务失败: {:?}", e),
            }
        }

        kill_result
    }
}
