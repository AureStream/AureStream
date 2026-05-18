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
use crate::commands::ProxyConfig;
use crate::error::AppError;
use crate::models::{AppEvent, ConnectionState, RuntimePolicy, RuntimeProfile, RuntimeSession};
use tauri::AppHandle;
use uuid::Uuid;

use self::core_manager::CoreManager;
use self::event_bus::EventBus;
use self::mihomo_sidecar::MihomoSidecar;
use self::proxy_manager::ProxyManager;
use self::session_manager::SessionManager;
use self::state_machine::{ensure_can_connect, ensure_can_disconnect, ensure_can_switch};

#[derive(Clone)]
pub struct RuntimeManager {
    inner: Arc<Inner>,
}

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

    pub async fn state(&self) -> ConnectionState {
        *self.inner.state.lock().await
    }

    pub async fn session(&self) -> Option<RuntimeSession> {
        self.inner.session.current().await
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

    pub async fn start_with_profile(
        &self,
        profile: RuntimeProfile,
        proxy_cfg: Option<ProxyConfig>,
    ) -> Result<(), AppError> {
        {
            let mut st = self.inner.state.lock().await;
            ensure_can_connect(*st)?;
            *st = ConnectionState::Connecting;
        }

        self.inner.events.publish(AppEvent::ConnectionStateChanged {
            state: ConnectionState::Connecting,
            node_id: profile.selected_node_id.clone(),
        });

        let session = RuntimeSession {
            session_id: Uuid::new_v4().to_string(),
            current_node_id: profile.selected_node_id.clone(),
            current_core: self.inner.core.adapter().core_type().to_string(),
            policy: profile.policy.clone(),
            started_at: chrono::Utc::now().timestamp(),
        };

        if let Err(e) = self.inner.core.adapter().start(&profile).await {
            let mut st = self.inner.state.lock().await;
            *st = ConnectionState::Error;
            drop(st);
            let msg = e.to_string();
            self.inner.events.publish(AppEvent::Error {
                message: msg.clone(),
            });
            return Err(e);
        }

        if let Some(cfg) = proxy_cfg.as_ref() {
            if let Err(e) = self.inner.proxy.enable(cfg) {
                let _ = self.inner.core.adapter().stop().await;
                let mut st = self.inner.state.lock().await;
                *st = ConnectionState::Error;
                drop(st);
                let msg = e.to_string();
                self.inner.events.publish(AppEvent::Error {
                    message: msg.clone(),
                });
                return Err(AppError::other(msg));
            }
        }

        {
            let mut st = self.inner.state.lock().await;
            *st = ConnectionState::Connected;
        }
        self.inner.session.replace(session).await;
        self.inner.events.publish(AppEvent::ConnectionStateChanged {
            state: ConnectionState::Connected,
            node_id: profile.selected_node_id.clone(),
        });
        Ok(())
    }

    pub async fn stop(&self, clear_system_proxy: bool) -> Result<(), AppError> {
        {
            let mut st = self.inner.state.lock().await;
            ensure_can_disconnect(*st)?;
            *st = ConnectionState::Disconnected;
        }

        let _ = self.inner.sidecar.stop_kill().await.map_err(AppError::other);
        if let Some(m) = &self.inner.mihomo {
            m.set_sidecar_running(false);
        }
        let _ = self.inner.core.adapter().stop().await;
        if clear_system_proxy {
            let _ = self.inner.proxy.disable();
        }
        self.inner.session.clear().await;
        self.inner.events.publish(AppEvent::ConnectionStateChanged {
            state: ConnectionState::Disconnected,
            node_id: None,
        });
        Ok(())
    }

    pub async fn switch_node(&self, node_id: &str) -> Result<(), AppError> {
        let st = *self.inner.state.lock().await;
        ensure_can_switch(st)?;
        self.inner.core.adapter().select_node(node_id).await
    }

    pub async fn set_policy(&self, policy: RuntimePolicy) -> Result<(), AppError> {
        self.inner.core.adapter().apply_policy(&policy).await
    }
}
