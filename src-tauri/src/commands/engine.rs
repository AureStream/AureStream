//! Engine IPC orchestration + `engine-state` events.
//!
//! Start order (spec §4.2): resolve ProxyNode → build_config → start → set_system_proxy.
//! Stop order (spec §4.3): clear_system_proxy → stop.
//! On any failure after Starting: clear proxy + stop + emit Failed (§4.2.6).
//! Commands never assemble Xray JSON — only Engine::build_config.

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use aurestream_config::{decode_subscription_body, ProxyNode};
use aurestream_engine::{Engine, EngineState, SharedXrayEngine, XrayEngine};
use aurestream_platform_proxy::{clear_system_proxy, set_system_proxy};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::Mutex as AsyncMutex;

use crate::state::{AuthState, SubsState};

pub const ENGINE_STATE_EVENT: &str = "engine-state";

const SELECTION_FILE: &str = "engine-selection.json";
const CONFIG_FILE: &str = "xray-config.json";
const DEFAULT_SOCKS_PORT: u16 = 10808;
const DEFAULT_API_PORT: u16 = 10809;
const PROXY_HOST: &str = "127.0.0.1";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct SelectionFile {
    selected_node: Option<String>,
}

/// App-owned engine handle + persisted selection (not the kernel dialect).
pub struct EngineAppState {
    engine: SharedXrayEngine,
    selected_node: Mutex<Option<String>>,
    /// Last payload emitted on `engine-state` (source of truth for `engine_get_state`).
    last_emitted: Mutex<EngineStatePayload>,
    /// Single-flight gate for start/stop/select-restart orchestration.
    gate: AsyncMutex<()>,
    selection_path: PathBuf,
    config_path: PathBuf,
    socks_port: u16,
    api_port: u16,
}

impl EngineAppState {
    pub fn load(app: &AppHandle) -> Result<Self, String> {
        let dir = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("app data dir: {e}"))?;
        fs::create_dir_all(&dir).map_err(|e| format!("create app data dir: {e}"))?;
        let selection_path = dir.join(SELECTION_FILE);
        let config_path = dir.join(CONFIG_FILE);
        let selected = read_selection(&selection_path)?;
        let initial = EngineStatePayload {
            state: "idle".into(),
            reason: None,
            selected_node: selected.clone(),
        };
        Ok(Self {
            engine: std::sync::Arc::new(XrayEngine::new()),
            selected_node: Mutex::new(selected),
            last_emitted: Mutex::new(initial),
            gate: AsyncMutex::new(()),
            selection_path,
            config_path,
            socks_port: DEFAULT_SOCKS_PORT,
            api_port: DEFAULT_API_PORT,
        })
    }

    pub fn selected_node(&self) -> Option<String> {
        self.selected_node
            .lock()
            .ok()
            .and_then(|g| g.clone())
    }

    pub fn set_selected_node(&self, tag: Option<String>) -> Result<(), String> {
        {
            let mut guard = self
                .selected_node
                .lock()
                .map_err(|_| "engine selection lock poisoned".to_string())?;
            *guard = tag.clone();
        }
        write_selection(
            &self.selection_path,
            &SelectionFile {
                selected_node: tag,
            },
        )
    }

    fn last_payload(&self) -> EngineStatePayload {
        self.last_emitted
            .lock()
            .map(|g| g.clone())
            .unwrap_or_else(|_| EngineStatePayload {
                state: "idle".into(),
                reason: None,
                selected_node: self.selected_node(),
            })
    }

    fn record_emitted(&self, payload: &EngineStatePayload) {
        if let Ok(mut guard) = self.last_emitted.lock() {
            *guard = payload.clone();
        }
    }

    fn payload_for(&self, state: EngineState) -> EngineStatePayload {
        let (state_str, reason) = match state {
            EngineState::Idle => ("idle".into(), None),
            EngineState::Starting => ("starting".into(), None),
            EngineState::Running => ("running".into(), None),
            EngineState::Stopping => ("stopping".into(), None),
            EngineState::Failed { reason } => ("failed".into(), Some(reason)),
        };
        EngineStatePayload {
            state: state_str,
            reason,
            selected_node: self.selected_node(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineStatePayload {
    pub state: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected_node: Option<String>,
}

fn read_selection(path: &PathBuf) -> Result<Option<String>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(path).map_err(|e| format!("read {}: {e}", path.display()))?;
    let file: SelectionFile =
        serde_json::from_str(&raw).map_err(|e| format!("parse {}: {e}", path.display()))?;
    Ok(file.selected_node)
}

fn write_selection(path: &PathBuf, value: &SelectionFile) -> Result<(), String> {
    let raw = serde_json::to_string_pretty(value)
        .map_err(|e| format!("serialize {}: {e}", path.display()))?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create dir: {e}"))?;
    }
    fs::write(path, raw).map_err(|e| format!("write {}: {e}", path.display()))
}

fn emit_engine_state(app: &AppHandle, engine_state: &EngineAppState, payload: &EngineStatePayload) {
    engine_state.record_emitted(payload);
    let _ = app.emit(ENGINE_STATE_EVENT, payload.clone());
}

fn emit_from(app: &AppHandle, engine_state: &EngineAppState, state: EngineState) {
    emit_engine_state(app, engine_state, &engine_state.payload_for(state));
}

fn emit_failed(app: &AppHandle, engine_state: &EngineAppState, reason: impl Into<String>) {
    emit_engine_state(
        app,
        engine_state,
        &EngineStatePayload {
            state: "failed".into(),
            reason: Some(reason.into()),
            selected_node: engine_state.selected_node(),
        },
    );
}

fn require_auth(auth: &AuthState) -> Result<(), String> {
    auth.access_token()
        .ok_or_else(|| "not_authenticated".to_string())?;
    Ok(())
}

fn sanitize_tag_like(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect();
    cleaned.trim_matches('-').to_string()
}

fn find_proxy_node(nodes: &[ProxyNode], tag: &str) -> Option<ProxyNode> {
    nodes.iter().find(|n| n.tag == tag).cloned().or_else(|| {
        nodes
            .iter()
            .find(|n| {
                sanitize_tag_like(&n.tag) == tag
                    || n.name == tag
                    || sanitize_tag_like(&n.name) == tag
            })
            .cloned()
    })
}

fn resolve_proxy_node(subs: &SubsState, node_tag: &str) -> Result<ProxyNode, String> {
    let snap = subs.snapshot()?;
    let active_id = snap
        .active_id
        .as_ref()
        .ok_or_else(|| "no_active_subscription".to_string())?;
    let body = snap
        .bodies
        .get(active_id)
        .ok_or_else(|| "subscription_body_missing".to_string())?;
    let nodes = decode_subscription_body(body).map_err(|e| format!("decode: {e}"))?;
    if nodes.is_empty() {
        return Err("no_nodes".into());
    }
    find_proxy_node(&nodes, node_tag)
        .or_else(|| {
            // Deterministic default: first decoded node when tag is empty.
            if node_tag.is_empty() {
                nodes.first().cloned()
            } else {
                None
            }
        })
        .ok_or_else(|| format!("node_not_found:{node_tag}"))
}

/// Spec §4.2.6: clear proxy, stop engine, emit Failed (recorded for get_state).
async fn fail_cleanup(app: &AppHandle, engine_state: &EngineAppState, reason: String) {
    let _ = clear_system_proxy();
    let _ = engine_state.engine.stop().await;
    emit_failed(app, engine_state, reason);
}

/// Core start steps after `starting` has been emitted. Errors bubble to caller for fail_cleanup.
async fn start_steps(
    engine_state: &EngineAppState,
    node: &ProxyNode,
) -> Result<(), String> {
    // If already running / leftover process, stop first (no dialect in this layer).
    match engine_state.engine.state() {
        EngineState::Idle | EngineState::Failed { .. } => {}
        _ => {
            let _ = clear_system_proxy();
            engine_state
                .engine
                .stop()
                .await
                .map_err(|e| e.to_string())?;
        }
    }

    engine_state
        .engine
        .build_config(
            &engine_state.config_path,
            node,
            engine_state.socks_port,
            engine_state.api_port,
        )
        .map_err(|e| e.to_string())?;

    engine_state
        .engine
        .start(&engine_state.config_path)
        .await
        .map_err(|e| e.to_string())?;

    set_system_proxy(PROXY_HOST, engine_state.socks_port)
        .map_err(|e| format!("set_system_proxy: {e}"))?;

    Ok(())
}

async fn start_with_node(
    app: &AppHandle,
    engine_state: &EngineAppState,
    node: &ProxyNode,
) -> Result<(), String> {
    emit_from(app, engine_state, EngineState::Starting);

    // Any failure after Starting must fail_cleanup so UI leaves「处理中…」.
    match start_steps(engine_state, node).await {
        Ok(()) => {
            emit_from(app, engine_state, EngineState::Running);
            Ok(())
        }
        Err(reason) => {
            fail_cleanup(app, engine_state, reason.clone()).await;
            Err(reason)
        }
    }
}

/// Current engine UI payload — last emitted `engine-state` (not raw SM after cleanup).
#[tauri::command]
pub fn engine_get_state(engine: State<'_, EngineAppState>) -> EngineStatePayload {
    engine.last_payload()
}

/// Persist selected node tag; if Running, rebuild + restart (no legacy hot-reload stack).
#[tauri::command]
pub async fn engine_select_node(
    app: AppHandle,
    auth: State<'_, AuthState>,
    subs: State<'_, SubsState>,
    engine: State<'_, EngineAppState>,
    node_tag: String,
) -> Result<EngineStatePayload, String> {
    require_auth(&auth)?;
    let tag = node_tag.trim().to_string();
    if tag.is_empty() {
        return Err("node_tag_required".into());
    }

    // Validate node exists in decoded cache (before taking the gate).
    let node = resolve_proxy_node(&subs, &tag)?;
    engine.set_selected_node(Some(node.tag.clone()))?;

    let _guard = engine.gate.lock().await;

    let was_running = matches!(engine.engine.state(), EngineState::Running)
        || engine.last_payload().state == "running";
    if was_running {
        start_with_node(&app, &engine, &node).await?;
    } else {
        let mut payload = engine.last_payload();
        payload.selected_node = engine.selected_node();
        emit_engine_state(&app, &engine, &payload);
    }

    Ok(engine.last_payload())
}

/// Start: resolve ProxyNode → build_config → start → system proxy → emit Running.
#[tauri::command]
pub async fn engine_start(
    app: AppHandle,
    auth: State<'_, AuthState>,
    subs: State<'_, SubsState>,
    engine: State<'_, EngineAppState>,
    node_tag: Option<String>,
) -> Result<EngineStatePayload, String> {
    require_auth(&auth)?;

    let requested = node_tag
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .or_else(|| engine.selected_node())
        .unwrap_or_default();

    let node = resolve_proxy_node(&subs, &requested)?;
    engine.set_selected_node(Some(node.tag.clone()))?;

    let _guard = engine.gate.lock().await;
    start_with_node(&app, &engine, &node).await?;
    Ok(engine.last_payload())
}

/// Stop: clear system proxy first, then stop sidecar → emit Idle.
#[tauri::command]
pub async fn engine_stop(
    app: AppHandle,
    engine: State<'_, EngineAppState>,
) -> Result<EngineStatePayload, String> {
    let _guard = engine.gate.lock().await;

    emit_from(&app, &engine, EngineState::Stopping);

    if let Err(e) = clear_system_proxy() {
        // Still attempt stop so we do not leave a blackhole.
        let _ = engine.engine.stop().await;
        let reason = format!("clear_system_proxy: {e}");
        emit_failed(&app, &engine, reason.clone());
        return Err(reason);
    }

    if let Err(e) = engine.engine.stop().await {
        let reason = e.to_string();
        emit_failed(&app, &engine, reason.clone());
        return Err(reason);
    }

    emit_from(&app, &engine, EngineState::Idle);
    Ok(engine.last_payload())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn failed_payload_shape_matches_event() {
        let payload = EngineStatePayload {
            state: "failed".into(),
            reason: Some("build_config boom".into()),
            selected_node: Some("n1".into()),
        };
        assert_eq!(payload.state, "failed");
        assert_eq!(payload.reason.as_deref(), Some("build_config boom"));
    }
}
