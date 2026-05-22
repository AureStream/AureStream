//! 运行时编排：`RuntimeManager` 门面 + 子管理器。
//!
//! Mihomo sidecar 由 [`MihomoSidecar`] 持有；与 [`MihomoAdapter`] 的 `set_sidecar_running` 同步。

mod core_manager;
mod event_bus;
mod mihomo_sidecar;
mod proxy_manager;
mod session_manager;
mod state_machine;

use std::path::PathBuf;
use std::sync::Arc;

use sqlx::SqlitePool;
use tokio::sync::Mutex;

use crate::adapter::{CoreAdapter, MihomoAdapter};
use crate::models::proxy_config::ProxyConfig;
use crate::models::ConnectionState;
use tauri::AppHandle;

use self::core_manager::CoreManager;
use self::event_bus::EventBus;
use self::mihomo_sidecar::MihomoSidecar;
use self::proxy_manager::ProxyManager;
use self::session_manager::SessionManager;

#[derive(Clone)]
pub struct RuntimeManager {
    inner: Arc<Inner>,
}

// Suppress dead code warnings for architectural components that may be used in the future
#[allow(dead_code)]
struct Inner {
    pool: SqlitePool,
    state: Mutex<ConnectionState>,
    core: CoreManager,
    mihomo: Option<Arc<MihomoAdapter>>,
    sidecar: MihomoSidecar,
    proxy: ProxyManager,
    session: SessionManager,
    events: EventBus,
}

impl RuntimeManager {
    pub fn new(pool: SqlitePool, core: Arc<dyn CoreAdapter>, mihomo: Option<Arc<MihomoAdapter>>) -> Self {
        Self {
            inner: Arc::new(Inner {
                pool,
                state: Mutex::new(ConnectionState::Disconnected),
                core: CoreManager::new(core),
                mihomo,
                sidecar: MihomoSidecar::default(),
                proxy: ProxyManager,
                session: SessionManager::default(),
                events: EventBus::new(64, 512),
            }),
        }
    }

    pub fn pool(&self) -> &SqlitePool {
        &self.inner.pool
    }

    /// 使用 `build_runtime_config` 等生成的 YAML 启动侧进程，并在就绪后尝试系统代理。
    pub async fn spawn_sidecar_with_config(
        &self,
        app: &AppHandle,
        config_path: PathBuf,
        proxy_cfg: ProxyConfig,
    ) -> Result<(), String> {
        self.inner
            .sidecar
            .spawn_with_config_file(app, config_path, proxy_cfg)
            .await?;
        if let Some(m) = &self.inner.mihomo {
            m.set_sidecar_running(true);
        }
        Ok(())
    }

    /// 停止本地代理内核侧进程。
    pub async fn stop_sidecar(&self) -> Result<(), String> {
        let r = self.inner.sidecar.stop_kill().await;
        if let Some(m) = &self.inner.mihomo {
            m.set_sidecar_running(false);
        }
        r
    }
}
