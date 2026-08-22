//! Engine IPC orchestration + `engine-state` events.
//!
//! Start order (spec §4.2): resolve ProxyNode → build_config → start → set_system_proxy.
//! Stop order (spec §4.3): clear_system_proxy → stop.
//! On any failure after Starting: clear proxy + stop + emit Failed (§4.2.6).
//! Commands never assemble Xray JSON — only Engine::build_config.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use aurestream_api_client::{ApiClient, ApiError, UsageResponse};
use aurestream_config::{decode_subscription_body, ProxyNode};
use aurestream_engine::{
    BuildOptions, EngineState, KernelId, SharedEngine, TrafficStats, XrayEngine,
};
use aurestream_platform_proxy::{clear_system_proxy, set_system_proxy};
use aurestream_platform_tun::{self as platform_tun, TunServiceState};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::Mutex as AsyncMutex;

use crate::commands::subs::{api_client, emit_subs_updated, is_expired_token};
use crate::node_key::{key_matches, node_endpoint, node_key};
use crate::persist::{read_json_opt, write_json};
use crate::state::{AuthState, SubsState};

pub const ENGINE_STATE_EVENT: &str = "engine-state";
pub const TRAFFIC_LOCAL_UPDATED_EVENT: &str = "traffic-local-updated";

const SELECTION_FILE: &str = "engine-selection.json";
const RUNTIME_SESSION_FILE: &str = "engine-runtime.json";
const DEFAULT_SOCKS_PORT: u16 = 10808;
const DEFAULT_API_PORT: u16 = 10809;
const PROXY_HOST: &str = "127.0.0.1";
const TRAFFIC_SAMPLE_INTERVAL: Duration = Duration::from_secs(60);
const TRAFFIC_REPORT_INTERVAL: Duration = Duration::from_secs(30 * 60);
const TRAFFIC_REPORT_TIMEOUT: Duration = Duration::from_secs(15);

/// Persisted selection.
///
/// Three descriptors of *one* node, ordered strongest first, so a selection
/// survives whatever the provider changes on the next sync:
///
/// | field | survives | written since |
/// |---|---|---|
/// | `selected_key` | renames, reordering | 1.0.1 (plaintext), 1.0.2 (hashed) |
/// | `selected_endpoint` | credential rotation on the same server | 1.0.2 |
/// | `selected_node` (tag) | nothing — display text, kept for the UI | 1.0.0 |
///
/// Every field is optional so a file from any version loads; unknown fields
/// from a *newer* version are ignored rather than rejected.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct SelectionFile {
    #[serde(default)]
    schema_version: u32,
    /// Display tag at the time of selection. Never resolve by this alone.
    #[serde(default)]
    selected_node: Option<String>,
    /// Stable node identity (`crate::node_key`). Primary lookup key.
    #[serde(default)]
    selected_key: Option<String>,
    /// `protocol|server|port` — last-resort match when the credential rotated.
    #[serde(default)]
    selected_endpoint: Option<String>,
}

/// Bump only when a stored field changes meaning; adding fields does not
/// require it (they default on read).
const SELECTION_SCHEMA_VERSION: u32 = 2;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeSession {
    #[serde(default)]
    session_id: String,
    capture_mode: CaptureMode,
}

#[derive(Debug, Clone)]
struct TrafficSession {
    subscription_id: String,
    outbound_tag: String,
    observed: TrafficStats,
}

#[derive(Debug, Default)]
struct TrafficAccounting {
    current: Option<TrafficSession>,
    pending: HashMap<String, TrafficStats>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct PendingTrafficPayload {
    subscription_id: String,
    upload: u64,
    download: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
struct TrafficLocalUpdatedPayload {
    pending: Vec<PendingTrafficPayload>,
}

impl TrafficAccounting {
    fn record_observation(&mut self, current: TrafficStats) {
        let Some(session) = self.current.as_mut() else {
            return;
        };
        let delta = TrafficStats {
            upload: current.upload.saturating_sub(session.observed.upload),
            download: current.download.saturating_sub(session.observed.download),
        };
        session.observed = current;
        if delta.upload == 0 && delta.download == 0 {
            return;
        }

        let pending = self
            .pending
            .entry(session.subscription_id.clone())
            .or_default();
        pending.upload = pending.upload.saturating_add(delta.upload);
        pending.download = pending.download.saturating_add(delta.download);
    }

    fn acknowledge(&mut self, subscription_id: &str, sent: TrafficStats) {
        if let Some(pending) = self.pending.get_mut(subscription_id) {
            pending.upload = pending.upload.saturating_sub(sent.upload);
            pending.download = pending.download.saturating_sub(sent.download);
            if pending.upload == 0 && pending.download == 0 {
                self.pending.remove(subscription_id);
            }
        }
    }
}

/// App-owned engine handle + persisted selection (not the kernel dialect).
pub struct EngineAppState {
    engine: SharedEngine,
    selected_node: Mutex<Option<String>>,
    /// Stable identity of the selection; recovers it when the tag drifts.
    selected_key: Mutex<Option<String>>,
    /// Endpoint of the selection; recovers it when the credential rotated.
    selected_endpoint: Mutex<Option<String>>,
    /// Active OS capture path (Off / SystemProxy / Tun).
    capture_mode: Mutex<CaptureMode>,
    /// Correlates one start/cleanup transaction in app and helper logs.
    session_id: Mutex<Option<String>>,
    traffic: Mutex<TrafficAccounting>,
    /// Last payload emitted on `engine-state` (source of truth for `engine_get_state`).
    last_emitted: Mutex<EngineStatePayload>,
    /// Single-flight gate for start/stop/select-restart orchestration.
    gate: AsyncMutex<()>,
    selection_path: PathBuf,
    runtime_session_path: PathBuf,
    config_path: PathBuf,
    socks_port: u16,
    api_port: u16,
}

/// Directory holding bundled `geoip.dat` / `geosite.dat` for this install.
///
/// Tauri's `resource_dir()` points at the bundle root, which is the resources
/// dir on some targets and its parent on others — probe both.
fn bundled_asset_dir(app: &AppHandle) -> Option<PathBuf> {
    let root = app.path().resource_dir().ok()?;
    let nested = root.join("resources");
    if nested.join("geoip.dat").is_file() {
        return Some(nested);
    }
    if root.join("geoip.dat").is_file() {
        return Some(root);
    }
    None
}

/// Single kernel selection point. Adding another kernel should only require a
/// new Engine implementation and a selection branch here.
fn create_engine(app: &AppHandle) -> SharedEngine {
    let mut engine = XrayEngine::new();
    if let Ok(log_dir) = crate::logging::app_log_dir(app) {
        engine = engine.with_log_dir(log_dir);
    }
    if let Some(assets) = bundled_asset_dir(app) {
        engine = engine.with_asset_dir(assets);
    }
    std::sync::Arc::new(engine)
}

impl EngineAppState {
    pub fn load(app: &AppHandle) -> Result<Self, String> {
        let dir = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("app data dir: {e}"))?;
        fs::create_dir_all(&dir).map_err(|e| format!("create app data dir: {e}"))?;
        let selection_path = dir.join(SELECTION_FILE);
        let runtime_session_path = dir.join(RUNTIME_SESSION_FILE);
        let selection = read_selection(&selection_path);
        let selected = selection.selected_node;
        let initial = EngineStatePayload {
            state: "idle".into(),
            reason: None,
            selected_node: selected.clone(),
            selected_node_id: selection.selected_key.clone(),
            capture_mode: CaptureMode::Off.as_str().into(),
        };
        let engine = create_engine(app);
        let config_path = dir.join(engine.config_filename());

        Ok(Self {
            engine,
            selected_node: Mutex::new(selected),
            selected_key: Mutex::new(selection.selected_key),
            selected_endpoint: Mutex::new(selection.selected_endpoint),
            capture_mode: Mutex::new(CaptureMode::Off),
            session_id: Mutex::new(None),
            traffic: Mutex::new(TrafficAccounting::default()),
            last_emitted: Mutex::new(initial),
            gate: AsyncMutex::new(()),
            selection_path,
            runtime_session_path,
            config_path,
            socks_port: DEFAULT_SOCKS_PORT,
            api_port: DEFAULT_API_PORT,
        })
    }

    pub fn selected_node(&self) -> Option<String> {
        self.selected_node.lock().ok().and_then(|g| g.clone())
    }

    pub fn selected_key(&self) -> Option<String> {
        self.selected_key.lock().ok().and_then(|g| g.clone())
    }

    pub fn selected_endpoint(&self) -> Option<String> {
        self.selected_endpoint.lock().ok().and_then(|g| g.clone())
    }

    /// Persist a selection by identity, endpoint *and* current tag.
    ///
    /// Called after every successful resolution, so a selection that had to be
    /// recovered (stale tag, legacy key format) is rewritten in the current
    /// form and resolves directly next time.
    pub fn set_selected(&self, node: &ProxyNode) -> Result<(), String> {
        let tag = node.tag.clone();
        let key = node_key(node);
        let endpoint = node_endpoint(node);
        set_locked(&self.selected_node, Some(tag.clone()))?;
        set_locked(&self.selected_key, Some(key.clone()))?;
        set_locked(&self.selected_endpoint, Some(endpoint.clone()))?;
        write_selection(
            &self.selection_path,
            &SelectionFile {
                schema_version: SELECTION_SCHEMA_VERSION,
                selected_node: Some(tag.clone()),
                selected_key: Some(key.clone()),
                selected_endpoint: Some(endpoint),
            },
        )?;
        // Keep last_emitted in lockstep so engine_get_state after a rewrite
        // (startup reconcile, sync) already shows the current id/tag.
        if let Ok(mut guard) = self.last_emitted.lock() {
            guard.selected_node = Some(tag);
            guard.selected_node_id = Some(key);
        }
        Ok(())
    }

    pub fn last_payload(&self) -> EngineStatePayload {
        self.last_emitted
            .lock()
            .map(|g| g.clone())
            .unwrap_or_else(|_| EngineStatePayload {
                state: "idle".into(),
                reason: None,
                selected_node: self.selected_node(),
                selected_node_id: self.selected_key(),
                capture_mode: self.capture_mode().as_str().into(),
            })
    }

    pub fn engine_state_raw(&self) -> EngineState {
        self.engine.state()
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
            selected_node_id: self.selected_key(),
            capture_mode: self.capture_mode().as_str().into(),
        }
    }

    pub fn capture_mode(&self) -> CaptureMode {
        self.capture_mode
            .lock()
            .map(|g| *g)
            .unwrap_or(CaptureMode::Off)
    }

    fn set_capture_mode_in_memory(&self, mode: CaptureMode) {
        if let Ok(mut g) = self.capture_mode.lock() {
            *g = mode;
        }
    }

    /// Record the target capture mode before making OS changes. The marker is
    /// intentionally left behind after an abrupt exit so the next process can
    /// reconcile stale proxy, DNS and elevated helper state.
    fn begin_capture(&self, mode: CaptureMode) -> Result<(), String> {
        if mode == CaptureMode::Off {
            return Err("invalid_capture_mode".into());
        }
        let session_id = new_session_id();
        *self
            .session_id
            .lock()
            .map_err(|_| "engine session lock poisoned".to_string())? = Some(session_id.clone());
        self.set_capture_mode_in_memory(mode);
        log::info!(
            "engine session begin id={} mode={}",
            session_id,
            mode.as_str()
        );
        Ok(())
    }

    /// Persist recovery intent immediately before starting a process or making
    /// capture changes. Failures in pure config preparation need no OS cleanup.
    fn arm_runtime_cleanup(&self) -> Result<(), String> {
        let capture_mode = self.capture_mode();
        let session_id = self
            .session_id
            .lock()
            .map_err(|_| "engine session lock poisoned".to_string())?
            .clone()
            .ok_or_else(|| "engine_session_missing".to_string())?;
        write_runtime_session(
            &self.runtime_session_path,
            &RuntimeSession {
                session_id,
                capture_mode,
            },
        )
    }

    fn persisted_capture_mode(&self) -> Option<CaptureMode> {
        read_runtime_session(&self.runtime_session_path).map(|session| session.capture_mode)
    }

    fn cleanup_mode(&self) -> CaptureMode {
        match self.capture_mode() {
            CaptureMode::Off => self.persisted_capture_mode().unwrap_or(CaptureMode::Off),
            mode => mode,
        }
    }

    fn finish_capture_cleanup(&self, remove_marker: bool) {
        self.set_capture_mode_in_memory(CaptureMode::Off);
        if let Ok(mut session_id) = self.session_id.lock() {
            *session_id = None;
        }
        if remove_marker && self.runtime_session_path.exists() {
            if let Err(e) = fs::remove_file(&self.runtime_session_path) {
                log::warn!(
                    "remove runtime session {}: {e}",
                    self.runtime_session_path.display()
                );
            }
        }
    }

    fn begin_traffic_session(&self, subscription_id: String, outbound_tag: String) {
        let outbound_tag = if outbound_tag.is_empty() {
            "proxy".to_string()
        } else {
            outbound_tag
        };
        if let Ok(mut traffic) = self.traffic.lock() {
            traffic.current = Some(TrafficSession {
                subscription_id,
                outbound_tag,
                observed: TrafficStats::default(),
            });
        }
    }

    fn finish_traffic_session(&self) {
        if let Ok(mut traffic) = self.traffic.lock() {
            traffic.current = None;
        }
    }

    fn pending_traffic(&self) -> Vec<(String, TrafficStats)> {
        self.traffic
            .lock()
            .map(|traffic| {
                traffic
                    .pending
                    .iter()
                    .filter(|(_, stats)| stats.upload > 0 || stats.download > 0)
                    .map(|(id, stats)| (id.clone(), *stats))
                    .collect()
            })
            .unwrap_or_default()
    }

    fn pending_traffic_payload(&self) -> TrafficLocalUpdatedPayload {
        let mut pending = self
            .pending_traffic()
            .into_iter()
            .map(|(subscription_id, stats)| PendingTrafficPayload {
                subscription_id,
                upload: stats.upload,
                download: stats.download,
            })
            .collect::<Vec<_>>();
        pending.sort_by(|a, b| a.subscription_id.cmp(&b.subscription_id));
        TrafficLocalUpdatedPayload { pending }
    }

    fn acknowledge_traffic(&self, subscription_id: &str, sent: TrafficStats) {
        if let Ok(mut traffic) = self.traffic.lock() {
            traffic.acknowledge(subscription_id, sent);
        }
    }
}

/// OS traffic capture path presented to UI / tray.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CaptureMode {
    #[default]
    Off,
    SystemProxy,
    Tun,
}

impl CaptureMode {
    pub fn as_str(self) -> &'static str {
        match self {
            CaptureMode::Off => "off",
            CaptureMode::SystemProxy => "system",
            CaptureMode::Tun => "tun",
        }
    }

    pub fn parse(s: &str) -> Self {
        match s.trim().to_ascii_lowercase().as_str() {
            "system" | "systemproxy" | "system_proxy" => CaptureMode::SystemProxy,
            "tun" | "virtual" | "nic" => CaptureMode::Tun,
            _ => CaptureMode::Off,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineStatePayload {
    pub state: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    /// Display tag of the selection — for showing, never for matching.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected_node: Option<String>,
    /// Stable identity of the selection. The UI matches rows by this, so a
    /// provider rename cannot make the selected row look unselected.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected_node_id: Option<String>,
    /// `off` | `system` | `tun`
    pub capture_mode: String,
}

/// Read the persisted selection, never failing.
///
/// A remembered selection is a convenience, not a prerequisite: an unreadable
/// file must degrade to "nothing remembered" — resolution then falls back to
/// the first node — instead of aborting app setup. `read_json_opt` moves the
/// bad file aside so it can still be inspected.
fn read_selection(path: &PathBuf) -> SelectionFile {
    match read_json_opt::<SelectionFile>(path) {
        Ok(Some(file)) => file,
        Ok(None) => SelectionFile::default(),
        Err(e) => {
            log::warn!("read selection: {e} — starting with no remembered node");
            SelectionFile::default()
        }
    }
}

fn set_locked(slot: &Mutex<Option<String>>, value: Option<String>) -> Result<(), String> {
    let mut guard = slot
        .lock()
        .map_err(|_| "engine selection lock poisoned".to_string())?;
    *guard = value;
    Ok(())
}

fn write_selection(path: &PathBuf, value: &SelectionFile) -> Result<(), String> {
    write_json(path, value)
}

fn read_runtime_session(path: &PathBuf) -> Option<RuntimeSession> {
    read_json_opt(path).ok().flatten()
}

fn new_session_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("{}-{nanos}", std::process::id())
}

fn write_runtime_session(path: &PathBuf, session: &RuntimeSession) -> Result<(), String> {
    write_json(path, session)
}

fn emit_engine_state(app: &AppHandle, engine_state: &EngineAppState, payload: &EngineStatePayload) {
    engine_state.record_emitted(payload);
    let _ = app.emit(ENGINE_STATE_EVENT, payload.clone());
    crate::tray::on_engine_payload(app);
}

fn emit_local_traffic(app: &AppHandle, engine_state: &EngineAppState) {
    let _ = app.emit(
        TRAFFIC_LOCAL_UPDATED_EVENT,
        engine_state.pending_traffic_payload(),
    );
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
            selected_node_id: engine_state.selected_key(),
            capture_mode: engine_state.capture_mode().as_str().into(),
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

/// Everything known about the node being asked for, strongest descriptor first.
///
/// A caller supplies whatever it has — the UI sends the id (and the tag it
/// displayed), a remembered selection contributes all three — and
/// [`pick_node`] walks them in order. Nothing here is required: an all-empty
/// query with `allow_fallback` still yields a usable node.
#[derive(Debug, Default, Clone, Copy)]
struct NodeQuery<'a> {
    /// Stable identity (`crate::node_key`), in any format ever written.
    key: Option<&'a str>,
    /// Second identity to try when `key` is a caller-supplied id that may be
    /// a stale format. Remembered selections go here so they are not masked.
    alt_key: Option<&'a str>,
    /// `protocol|server|port`; matches after a credential rotation.
    endpoint: Option<&'a str>,
    /// Display tag. Provider-controlled, so the weakest signal there is.
    tag: Option<&'a str>,
    /// Take the first available node rather than erroring when nothing matched.
    ///
    /// True for anything that just needs *a* connection (the connect button,
    /// the tray, a remembered selection); false only when the user pointed at
    /// one specific row and silently connecting elsewhere would be a lie.
    allow_fallback: bool,
}

impl<'a> NodeQuery<'a> {
    /// A selection remembered from a previous session. Always recoverable —
    /// the home screen only exposes the node list once connected, so erroring
    /// here would strand the user with no way to pick a replacement.
    fn remembered(
        key: Option<&'a str>,
        endpoint: Option<&'a str>,
        tag: Option<&'a str>,
    ) -> Self {
        Self {
            key,
            alt_key: None,
            endpoint,
            tag,
            allow_fallback: true,
        }
    }

    fn describe(&self) -> String {
        format!(
            "key={} alt_key={} endpoint={} tag={}",
            self.key.unwrap_or("-"),
            self.alt_key.unwrap_or("-"),
            self.endpoint.unwrap_or("-"),
            self.tag.unwrap_or("-")
        )
    }
}

fn resolve_proxy_node(subs: &SubsState, query: NodeQuery<'_>) -> Result<ProxyNode, String> {
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
    pick_node(&nodes, query)
}

/// Pure selection step of [`resolve_proxy_node`], split out so the recovery
/// ladder can be tested without a live `SubsState`. `nodes` must be non-empty.
///
/// The ladder, strongest match first. Each rung exists because a provider was
/// observed doing exactly the thing that breaks the rung above it:
///
/// 1. **identity** — the node, whatever it is now called.
/// 2. **tag** (exact, then sanitized/name) — pre-1.0.2 selections and callers
///    that only have a tag.
/// 3. **endpoint** — same `protocol|server|port` after the credential rotated.
/// 4. **first node** — only when `allow_fallback`; a connect action must not
///    dead-end just because the remembered node disappeared.
fn pick_node(nodes: &[ProxyNode], query: NodeQuery<'_>) -> Result<ProxyNode, String> {
    for key in [query.key, query.alt_key]
        .into_iter()
        .flatten()
        .filter(|k| !k.is_empty())
    {
        if let Some(node) = nodes.iter().find(|n| key_matches(key, n)) {
            return Ok(node.clone());
        }
    }

    if let Some(tag) = query.tag.filter(|t| !t.is_empty()) {
        if let Some(node) = find_proxy_node(nodes, tag) {
            return Ok(node.clone());
        }
    }

    if let Some(endpoint) = query.endpoint.filter(|e| !e.is_empty()) {
        if let Some(node) = nodes.iter().find(|n| node_endpoint(n) == endpoint) {
            log::info!(
                "resolve_proxy_node: recovered by endpoint ({}) -> '{}'",
                query.describe(),
                node.tag
            );
            return Ok(node.clone());
        }
    }

    if query.allow_fallback {
        if let Some(first) = nodes.first() {
            log::warn!(
                "resolve_proxy_node: unresolvable ({}), falling back to '{}'",
                query.describe(),
                first.tag
            );
            return Ok(first.clone());
        }
    }

    Err(format!("node_not_found:{}", query.tag.unwrap_or_default()))
}

/// Resolve a remembered selection against the current subscription and rewrite
/// it in the current identity format.
///
/// Called at process start and after every successful `subs_sync`. A file
/// written by 1.0.0 (tag only) or 1.0.1 (plaintext key) becomes `n2:` +
/// endpoint on disk, so the next launch and the UI both see identifiers this
/// build emitted. Missing nodes / no subscription leave the file untouched.
pub fn reconcile_persisted_state(subs: &SubsState, engine: &EngineAppState) {
    let node = match resolve_remembered_node(subs, engine) {
        Ok(node) => node,
        Err(e) => {
            log::info!("reconcile selection skipped: {e}");
            return;
        }
    };

    let next_key = node_key(&node);
    let next_endpoint = node_endpoint(&node);
    let already_current = engine.selected_key().as_deref() == Some(next_key.as_str())
        && engine.selected_endpoint().as_deref() == Some(next_endpoint.as_str())
        && engine.selected_node().as_deref() == Some(node.tag.as_str());
    if already_current {
        return;
    }

    if let Err(e) = engine.set_selected(&node) {
        log::warn!("reconcile selection rewrite failed: {e}");
        return;
    }
    log::info!(
        "reconcile selection rewritten to current format tag='{}'",
        node.tag
    );
}

/// Emit the current engine payload so the UI picks up a rewritten selection.
pub fn emit_reconciled_selection(app: &AppHandle, engine: &EngineAppState) {
    emit_engine_state(app, engine, &engine.last_payload());
}

/// Resolve whatever selection the app remembers (tray / no-argument starts).
fn resolve_remembered_node(
    subs: &SubsState,
    engine: &EngineAppState,
) -> Result<ProxyNode, String> {
    let key = engine.selected_key();
    let endpoint = engine.selected_endpoint();
    let tag = engine.selected_node();
    resolve_proxy_node(
        subs,
        NodeQuery::remembered(
            key.as_deref().filter(|k| !k.is_empty()),
            endpoint.as_deref().filter(|e| !e.is_empty()),
            tag.as_deref().filter(|t| !t.is_empty()),
        ),
    )
}

fn non_empty(value: &str) -> Option<&str> {
    Some(value).filter(|v| !v.is_empty())
}

fn active_subscription_id(subs: &SubsState) -> Result<String, String> {
    subs.snapshot()?
        .active_id
        .ok_or_else(|| "no_active_subscription".to_string())
}

async fn collect_current_traffic(engine_state: &EngineAppState) -> Result<(), String> {
    let session = engine_state
        .traffic
        .lock()
        .map_err(|_| "traffic state lock poisoned".to_string())?
        .current
        .clone();
    let Some(session) = session else {
        return Ok(());
    };

    let current = engine_state
        .engine
        .query_outbound_traffic(&session.outbound_tag)
        .await
        .map_err(|e| e.to_string())?;
    let mut traffic = engine_state
        .traffic
        .lock()
        .map_err(|_| "traffic state lock poisoned".to_string())?;
    let Some(active) = traffic.current.as_mut() else {
        return Ok(());
    };
    if active.subscription_id != session.subscription_id
        || active.outbound_tag != session.outbound_tag
    {
        return Ok(());
    }

    traffic.record_observation(current);
    Ok(())
}

async fn report_usage_once(
    client: &ApiClient,
    token: &str,
    subscription_id: &str,
    usage: TrafficStats,
) -> Result<UsageResponse, ApiError> {
    tokio::time::timeout(
        TRAFFIC_REPORT_TIMEOUT,
        client.report_subscription_usage(token, subscription_id, usage.upload, usage.download),
    )
    .await
    .map_err(|_| ApiError::from_code("request_timeout", 0, None))?
}

async fn report_usage_with_refresh(
    client: &ApiClient,
    auth: &AuthState,
    subscription_id: &str,
    usage: TrafficStats,
) -> Result<UsageResponse, ApiError> {
    let token = auth
        .access_token()
        .ok_or_else(|| ApiError::from_code("not_authenticated", 401, None))?;
    match report_usage_once(client, &token, subscription_id, usage).await {
        Ok(response) => Ok(response),
        Err(error) if is_expired_token(&error) => {
            log::info!("traffic report: access token expired, refreshing");
            let fresh = tokio::time::timeout(
                TRAFFIC_REPORT_TIMEOUT,
                auth.refresh_access_token(client, &token),
            )
            .await
            .map_err(|_| ApiError::from_code("request_timeout", 0, None))??;
            report_usage_once(client, &fresh, subscription_id, usage).await
        }
        Err(error) => Err(error),
    }
}

async fn flush_traffic_usage(
    app: &AppHandle,
    engine_state: &EngineAppState,
    collect_current: bool,
) -> Result<(), String> {
    let mut errors = Vec::new();
    if collect_current {
        if let Err(error) = collect_current_traffic(engine_state).await {
            errors.push(format!("collect traffic: {error}"));
        }
        emit_local_traffic(app, engine_state);
    }

    let pending = engine_state.pending_traffic();
    if pending.is_empty() {
        return if errors.is_empty() {
            Ok(())
        } else {
            Err(errors.join("; "))
        };
    }

    let auth = app
        .try_state::<AuthState>()
        .ok_or_else(|| "auth_state_missing".to_string())?;
    let subs = app
        .try_state::<SubsState>()
        .ok_or_else(|| "subs_state_missing".to_string())?;
    let _operation_guard = subs.lock_operations().await;
    let client = api_client();

    for (subscription_id, usage) in pending {
        match report_usage_with_refresh(&client, &auth, &subscription_id, usage).await {
            Ok(response) => {
                engine_state.acknowledge_traffic(&subscription_id, usage);
                log::info!(
                    "traffic report ok subscription={} upload={} download={} total_used={}",
                    subscription_id,
                    usage.upload,
                    usage.download,
                    response.traffic_used
                );
                match subs.update_traffic(
                    &subscription_id,
                    response.traffic_used,
                    response.traffic_total,
                ) {
                    Ok(snapshot) => emit_subs_updated(app, &snapshot),
                    Err(error) => log::warn!(
                        "traffic report cache update failed subscription={subscription_id}: {error}"
                    ),
                }
                emit_local_traffic(app, engine_state);
            }
            Err(error) => {
                errors.push(format!(
                    "report traffic subscription={subscription_id}: {error}"
                ));
            }
        }
    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join("; "))
    }
}

/// Sample Xray counters once per minute so the UI can include usage that has
/// not yet reached the Worker. Sampling never performs a network request.
pub fn spawn_traffic_sampler(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(TRAFFIC_SAMPLE_INTERVAL);
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        interval.tick().await;
        loop {
            interval.tick().await;
            let Some(engine) = app.try_state::<EngineAppState>() else {
                continue;
            };
            let _guard = engine.gate.lock().await;
            if !matches!(engine.engine.state(), EngineState::Running) {
                continue;
            }
            if let Err(error) = collect_current_traffic(&engine).await {
                log::warn!("periodic local traffic sample failed: {error}");
                continue;
            }
            emit_local_traffic(&app, &engine);
        }
    });
}

/// Report traffic on a fixed 30-minute cadence. The engine gate keeps the
/// queried process and outbound stable while counters are collected.
pub fn spawn_traffic_reporter(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(TRAFFIC_REPORT_INTERVAL);
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        interval.tick().await;
        loop {
            interval.tick().await;
            let Some(engine) = app.try_state::<EngineAppState>() else {
                continue;
            };
            let _guard = engine.gate.lock().await;
            let collect_current = matches!(engine.engine.state(), EngineState::Running);
            if let Err(error) = flush_traffic_usage(&app, &engine, collect_current).await {
                log::warn!("periodic traffic report failed: {error}");
            }
        }
    });
}

/// Idempotent teardown shared by IPC, tray, mode switches, failure handling and
/// the health monitor. Every step is attempted even if an earlier one fails.
async fn cleanup_runtime(app: &AppHandle, engine_state: &EngineAppState) -> Result<(), String> {
    let mode = engine_state.cleanup_mode();
    if let Some(session) = read_runtime_session(&engine_state.runtime_session_path) {
        log::info!(
            "engine session cleanup id={} mode={}",
            session.session_id,
            mode.as_str()
        );
    }
    let mut errors = Vec::new();

    if matches!(engine_state.engine.state(), EngineState::Running) {
        if let Err(error) = flush_traffic_usage(app, engine_state, true).await {
            // Usage reporting is best-effort and must never strand proxy/DNS state.
            log::warn!("final traffic report failed: {error}");
        }
    } else if let Err(error) = flush_traffic_usage(app, engine_state, false).await {
        log::warn!("pending traffic report failed: {error}");
    }
    engine_state.finish_traffic_session();

    if let Err(e) = clear_system_proxy() {
        errors.push(format!("clear_system_proxy: {e}"));
    }

    if mode == CaptureMode::Tun {
        // Always attempt TUN stop — platform_tun::stop_tun is idempotent.
        // Linux uses a control FIFO (no signals to root); Win/mac use service/XPC.
        // Never skip this when the runtime marker is missing — that left TUN up.
        //
        // Exception: if the elevated helper isn't installed at all, there is
        // nothing to signal — treat as already-clean. Otherwise a leftover
        // stale marker plus a never-installed/removed helper wedges every
        // future start behind an unresolvable "can't reach helper" error,
        // since a failed cleanup here never clears the marker (see
        // finish_capture_cleanup) and start_with_node bails out before
        // start_steps whenever cleanup fails.
        if platform_tun::probe() != TunServiceState::NotInstalled {
            if let Err(e) = platform_tun::stop_tun() {
                errors.push(e.to_string());
            }
        }
        if let Err(e) = engine_state.engine.finish_external_stop() {
            errors.push(e.to_string());
        }
    } else if let Err(e) = engine_state.engine.stop().await {
        errors.push(e.to_string());
    }

    let succeeded = errors.is_empty();
    engine_state.finish_capture_cleanup(succeeded);
    if succeeded {
        Ok(())
    } else {
        Err(errors.join("; "))
    }
}

async fn fail_cleanup(app: &AppHandle, engine_state: &EngineAppState, reason: String) {
    log::error!("engine failure: {reason}");
    if let Err(cleanup_error) = cleanup_runtime(app, engine_state).await {
        log::warn!("engine failure cleanup incomplete: {cleanup_error}");
    }
    emit_failed(app, engine_state, reason);
}

/// Clear capture state left by a previous process before accepting new starts.
/// The runtime marker covers platforms whose helper probe cannot report whether
/// a TUN session is still active; Windows service state is also checked as a
/// fallback for sessions created before the marker existed.
pub fn reconcile_stale_runtime(engine_state: &EngineAppState) {
    let marker_present = engine_state.runtime_session_path.exists();
    let persisted_session = read_runtime_session(&engine_state.runtime_session_path);
    let marker_unreadable = marker_present && persisted_session.is_none();
    if marker_unreadable {
        log::warn!("startup runtime marker unreadable — treating as stale");
    }
    let persisted = persisted_session.map(|session| {
        log::info!(
            "startup found stale engine session id={} mode={}",
            session.session_id,
            session.capture_mode.as_str()
        );
        session.capture_mode
    });
    let tun_running = matches!(platform_tun::probe(), TunServiceState::Running);
    if !marker_present && !tun_running {
        return;
    }
    let mut failed = false;

    if let Err(e) = clear_system_proxy() {
        failed = true;
        log::warn!("startup stale system proxy cleanup failed: {e}");
    }

    if persisted == Some(CaptureMode::Tun) || tun_running || marker_unreadable {
        log::info!("startup reconciling stale TUN runtime");
        // See the matching guard in cleanup_runtime: a never-installed/removed
        // helper has nothing to stop, and treating that as a failure here
        // would keep re-persisting the stale marker across every relaunch.
        if platform_tun::probe() != TunServiceState::NotInstalled {
            if let Err(e) = platform_tun::stop_tun() {
                failed = true;
                log::warn!("startup stale TUN cleanup failed: {e}");
            }
        }
    }

    engine_state.finish_capture_cleanup(!failed);
}

/// Synchronous shell hook for the final Tauri exit event. Normal tray quit and
/// IPC stop already use the same async cleanup; this is a last best-effort pass.
pub fn cleanup_on_exit(app: &AppHandle) {
    let Some(engine_state) = app.try_state::<EngineAppState>() else {
        let _ = clear_system_proxy();
        return;
    };
    let result = tauri::async_runtime::block_on(async {
        let _guard = engine_state.gate.lock().await;
        cleanup_runtime(app, &engine_state).await
    });
    if let Err(e) = result {
        log::warn!("engine cleanup on exit incomplete: {e}");
    }
}

/// Entry point shared with current polling and future kernel-native exit
/// notifications. It serializes against user start/stop requests.
pub async fn handle_runtime_failure(app: &AppHandle, reason: String) {
    let Some(engine_state) = app.try_state::<EngineAppState>() else {
        return;
    };
    let _guard = engine_state.gate.lock().await;
    let still_failed = matches!(
        engine_state.engine.state(),
        EngineState::Failed { reason: ref current } if current == &reason
    );
    if !still_failed || engine_state.last_payload().state == "failed" {
        return;
    }

    fail_cleanup(app, &engine_state, reason.clone()).await;
    crate::tray::emit_error_alert(app, "连接已中断", reason);
}

/// Observe kernel state until the engine crate provides direct exit callbacks.
/// Once a supervisor marks the raw state Failed, cleanup and UI notification
/// happen here without changing the IPC/event contract.
pub fn spawn_engine_health_monitor(app: &AppHandle) {
    let Some(engine_state) = app.try_state::<EngineAppState>() else {
        log::warn!("engine health monitor not started: EngineAppState missing");
        return;
    };
    let mut exit_events = engine_state.engine.subscribe_exit_events();

    let event_app = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            match exit_events.recv().await {
                Ok(event) => {
                    log::error!(
                        "engine sidecar exited generation={} code={:?}: {}",
                        event.generation,
                        event.code,
                        event.reason
                    );
                    handle_runtime_failure(&event_app, event.reason).await;
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(skipped)) => {
                    log::warn!("engine exit monitor lagged; skipped {skipped} events");
                }
                Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
            }
        }
    });

    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(2)).await;
            let Some(engine_state) = app.try_state::<EngineAppState>() else {
                continue;
            };
            let payload = engine_state.last_payload();
            if payload.state == "running"
                && engine_state.capture_mode() == CaptureMode::Tun
                && tun_runtime_is_missing()
            {
                let reason = "TUN 服务意外停止".to_string();
                let _ = engine_state.engine.fail_external_start(reason.clone());
                handle_runtime_failure(&app, reason).await;
                continue;
            }
            let EngineState::Failed { reason } = engine_state.engine.state() else {
                continue;
            };
            if engine_state.last_payload().state != "failed" {
                handle_runtime_failure(&app, reason).await;
            }
        }
    });
}

// Only Windows currently exposes live service state through `probe`. Linux and
// macOS report helper installation/readiness, so treating Ready as a dead
// runtime there would disconnect every healthy TUN session.
#[cfg(target_os = "windows")]
fn tun_runtime_is_missing() -> bool {
    !matches!(platform_tun::probe(), TunServiceState::Running)
}

#[cfg(not(target_os = "windows"))]
fn tun_runtime_is_missing() -> bool {
    false
}

fn build_options_for(
    mode: CaptureMode,
    engine_state: &EngineAppState,
    smart_routing: bool,
) -> BuildOptions {
    let mut opts = match mode {
        CaptureMode::Tun => BuildOptions::tun(engine_state.socks_port, engine_state.api_port),
        _ => BuildOptions::system_proxy(engine_state.socks_port, engine_state.api_port),
    };
    opts.smart_routing = smart_routing;
    opts
}

/// Core start steps after `starting` has been emitted. Errors bubble to caller for fail_cleanup.
async fn start_steps(
    engine_state: &EngineAppState,
    node: &ProxyNode,
    mode: CaptureMode,
    smart_routing: bool,
) -> Result<(), String> {
    let opts = build_options_for(mode, engine_state, smart_routing);
    engine_state
        .engine
        .build_config_with_options(&engine_state.config_path, node, opts)
        .map_err(|e| e.to_string())?;

    match mode {
        CaptureMode::SystemProxy => {
            engine_state.arm_runtime_cleanup()?;
            engine_state
                .engine
                .start(&engine_state.config_path)
                .await
                .map_err(|e| e.to_string())?;
            set_system_proxy(PROXY_HOST, engine_state.socks_port)
                .map_err(|e| format!("set_system_proxy: {e}"))?;
        }
        CaptureMode::Tun => {
            // Clear system proxy so capture is exclusive to TUN.
            let _ = clear_system_proxy();

            let launch = engine_state
                .engine
                .launch_spec()
                .map_err(|e| e.to_string())?;
            if launch.id != KernelId::XRAY {
                return Err(format!("tun_kernel_unsupported:{}", launch.id));
            }
            log::info!(
                "external kernel launch id={} executable={} assets={}",
                launch.id,
                launch.executable.display(),
                launch
                    .asset_dir
                    .as_ref()
                    .map(|path| path.display().to_string())
                    .unwrap_or_else(|| "<none>".into())
            );

            // Elevated path owns the core process (pkexec/helper). Do not also
            // spawn a user-space sidecar via Engine::start.
            engine_state.arm_runtime_cleanup()?;
            engine_state
                .engine
                .begin_external_start(engine_state.socks_port, engine_state.api_port)
                .map_err(|e| e.to_string())?;

            // OS DNS hijack: always a public resolver routed into TUN (1.1.1.1).
            // Do NOT use TUN gateway 198.18.0.1 — host stack treats it as local
            // iface addr and :53 is refused (Linux verified; same risk on Win/mac
            // unless the OS exclusively uses the TUN iface DNS path).
            // XTLS tun.dns is Windows-only; Linux/macOS need OS-level override.
            let dns_hijack = Some("1.1.1.1");

            if let Err(e) = platform_tun::start_tun(
                &engine_state.config_path,
                &launch.executable,
                dns_hijack,
                launch.asset_dir.as_deref(),
            ) {
                let _ = engine_state.engine.fail_external_start(e.message.clone());
                return Err(e.message);
            }

            engine_state
                .engine
                .finish_external_start()
                .map_err(|e| e.to_string())?;

            let _ = clear_system_proxy();
        }
        CaptureMode::Off => {
            return Err("invalid_capture_mode".into());
        }
    }

    Ok(())
}

async fn start_with_node(
    app: &AppHandle,
    engine_state: &EngineAppState,
    node: &ProxyNode,
    subscription_id: &str,
    mode: CaptureMode,
    smart_routing: bool,
) -> Result<(), String> {
    let has_previous_runtime = engine_state.cleanup_mode() != CaptureMode::Off
        || !matches!(engine_state.engine.state(), EngineState::Idle);
    if has_previous_runtime {
        if let Err(reason) = cleanup_runtime(app, engine_state).await {
            emit_failed(app, engine_state, reason.clone());
            return Err(reason);
        }
    }

    if let Err(reason) = engine_state.begin_capture(mode) {
        emit_failed(app, engine_state, reason.clone());
        return Err(reason);
    }
    emit_from(app, engine_state, EngineState::Starting);

    match start_steps(engine_state, node, mode, smart_routing).await {
        Ok(()) => {
            engine_state.begin_traffic_session(subscription_id.to_string(), node.tag.clone());
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
    node_id: Option<String>,
) -> Result<EngineStatePayload, String> {
    require_auth(&auth)?;
    let tag = node_tag.trim().to_string();
    let id = node_id.unwrap_or_default().trim().to_string();
    if tag.is_empty() && id.is_empty() {
        return Err("node_tag_required".into());
    }

    // An explicit pick from the node list: no first-node fallback, because
    // silently connecting somewhere else would contradict what the user
    // tapped. The id makes a miss near-impossible — it comes from the same
    // decode the engine resolves against.
    let node = resolve_proxy_node(
        &subs,
        NodeQuery {
            key: non_empty(&id),
            alt_key: None,
            endpoint: None,
            tag: non_empty(&tag),
            allow_fallback: false,
        },
    )?;
    let subscription_id = active_subscription_id(&subs)?;

    let _guard = engine.gate.lock().await;

    engine.set_selected(&node)?;
    log::info!("select_node tag={}", node.tag);

    let was_running = matches!(engine.engine.state(), EngineState::Running)
        || engine.last_payload().state == "running";
    if was_running {
        let mode = match engine.capture_mode() {
            CaptureMode::Off => CaptureMode::SystemProxy,
            m => m,
        };
        start_with_node(&app, &engine, &node, &subscription_id, mode, true).await?;
    } else {
        let mut payload = engine.last_payload();
        payload.selected_node = engine.selected_node();
        payload.selected_node_id = engine.selected_key();
        emit_engine_state(&app, &engine, &payload);
    }

    Ok(engine.last_payload())
}

/// Start: resolve ProxyNode → build_config → start → capture (system proxy or TUN).
///
/// `mode`: `"system"` (default) | `"tun"`.
/// `smart_routing`: optional; default true (rule split).
#[tauri::command]
pub async fn engine_start(
    app: AppHandle,
    auth: State<'_, AuthState>,
    subs: State<'_, SubsState>,
    engine: State<'_, EngineAppState>,
    node_tag: Option<String>,
    node_id: Option<String>,
    mode: Option<String>,
    smart_routing: Option<bool>,
) -> Result<EngineStatePayload, String> {
    require_auth(&auth)?;

    // Connecting must never dead-end. The UI passes what it displayed (id +
    // tag); anything it does not know is filled in from the remembered
    // selection, and if none of it resolves, `allow_fallback` picks the first
    // available node instead of erroring — the home screen only exposes the
    // node list once connected, so an error here strands the user.
    let requested_id = node_id.unwrap_or_default().trim().to_string();
    let requested_tag = node_tag.unwrap_or_default().trim().to_string();
    let remembered_key = engine.selected_key();
    let remembered_endpoint = engine.selected_endpoint();
    let remembered_tag = engine.selected_node();
    let key = non_empty(&requested_id);
    let alt_key = remembered_key.as_deref().filter(|k| !k.is_empty());
    let tag = non_empty(&requested_tag)
        .or_else(|| remembered_tag.as_deref().filter(|t| !t.is_empty()));
    // The remembered endpoint only describes the remembered node. Use it when
    // the caller did not name a different node, or when the name they sent
    // cannot be the current identity (so it must not hide the remembered one).
    let endpoint = remembered_endpoint.as_deref().filter(|e| !e.is_empty());

    let node = resolve_proxy_node(
        &subs,
        NodeQuery {
            key,
            alt_key,
            endpoint,
            tag,
            allow_fallback: true,
        },
    )?;
    let subscription_id = active_subscription_id(&subs)?;
    engine.set_selected(&node)?;

    let capture = match mode.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        Some(m) => CaptureMode::parse(m),
        None => CaptureMode::SystemProxy,
    };
    if matches!(capture, CaptureMode::Off) {
        return Err("mode_required".into());
    }
    let smart = smart_routing.unwrap_or(true);
    log::info!(
        "engine_start node={} mode={} smart_routing={smart}",
        node.tag,
        capture.as_str()
    );

    let _guard = engine.gate.lock().await;
    start_with_node(&app, &engine, &node, &subscription_id, capture, smart).await?;
    Ok(engine.last_payload())
}

/// Probe elevated TUN helper (for UI enablement / error copy).
#[tauri::command]
pub fn engine_probe_tun() -> String {
    match platform_tun::probe() {
        TunServiceState::NotInstalled => "notInstalled".into(),
        TunServiceState::Ready => "ready".into(),
        TunServiceState::Running => "running".into(),
    }
}

/// Uninstall elevated TUN helper/service (macOS SMJobBless / Windows SCM).
/// Stops TUN first. May prompt for admin / UAC once.
#[tauri::command]
pub async fn engine_uninstall_helper(
    app: AppHandle,
    engine: State<'_, EngineAppState>,
) -> Result<(), String> {
    let _guard = engine.gate.lock().await;
    log::info!("engine_uninstall_helper");

    let had_runtime = engine.cleanup_mode() != CaptureMode::Off
        || !matches!(engine.engine.state(), EngineState::Idle);
    if had_runtime {
        emit_from(&app, &engine, EngineState::Stopping);
        if let Err(reason) = cleanup_runtime(&app, &engine).await {
            emit_failed(&app, &engine, reason.clone());
            return Err(reason);
        }
    }

    if let Err(e) = platform_tun::uninstall_elevated() {
        let reason = e.to_string();
        if had_runtime {
            emit_failed(&app, &engine, reason.clone());
        }
        return Err(reason);
    }

    if had_runtime {
        emit_from(&app, &engine, EngineState::Idle);
    }

    log::info!("engine_uninstall_helper ok");
    Ok(())
}

/// Stop: clear system proxy first, then stop sidecar → emit Idle.
#[tauri::command]
pub async fn engine_stop(
    app: AppHandle,
    engine: State<'_, EngineAppState>,
) -> Result<EngineStatePayload, String> {
    let _guard = engine.gate.lock().await;
    log::info!("engine_stop");

    emit_from(&app, &engine, EngineState::Stopping);

    if let Err(reason) = cleanup_runtime(&app, &engine).await {
        emit_failed(&app, &engine, reason.clone());
        return Err(reason);
    }

    emit_from(&app, &engine, EngineState::Idle);
    Ok(engine.last_payload())
}

/// Tray / shell: start system-proxy capture (requires auth + cached nodes).
pub async fn tray_start_system(app: &AppHandle) -> Result<(), String> {
    let auth = app
        .try_state::<AuthState>()
        .ok_or_else(|| "auth_state_missing".to_string())?;
    let subs = app
        .try_state::<SubsState>()
        .ok_or_else(|| "subs_state_missing".to_string())?;
    let engine = app
        .try_state::<EngineAppState>()
        .ok_or_else(|| "engine_state_missing".to_string())?;

    require_auth(&auth)?;

    let node = resolve_remembered_node(&subs, &engine)?;
    let subscription_id = active_subscription_id(&subs)?;
    engine.set_selected(&node)?;

    let _guard = engine.gate.lock().await;
    start_with_node(
        app,
        &engine,
        &node,
        &subscription_id,
        CaptureMode::SystemProxy,
        true,
    )
    .await?;
    Ok(())
}

/// Tray / shell: start TUN capture when helper is available.
pub async fn tray_start_tun(app: &AppHandle) -> Result<(), String> {
    let auth = app
        .try_state::<AuthState>()
        .ok_or_else(|| "auth_state_missing".to_string())?;
    let subs = app
        .try_state::<SubsState>()
        .ok_or_else(|| "subs_state_missing".to_string())?;
    let engine = app
        .try_state::<EngineAppState>()
        .ok_or_else(|| "engine_state_missing".to_string())?;

    require_auth(&auth)?;

    let node = resolve_remembered_node(&subs, &engine)?;
    let subscription_id = active_subscription_id(&subs)?;
    engine.set_selected(&node)?;

    let _guard = engine.gate.lock().await;
    start_with_node(
        app,
        &engine,
        &node,
        &subscription_id,
        CaptureMode::Tun,
        true,
    )
    .await?;
    Ok(())
}

/// Tray / shell: clear system proxy and stop sidecar.
pub async fn tray_stop(app: &AppHandle) -> Result<(), String> {
    let Some(engine) = app.try_state::<EngineAppState>() else {
        let _ = clear_system_proxy();
        return Ok(());
    };

    let _guard = engine.gate.lock().await;
    let state = engine.last_payload().state;
    if state == "idle"
        && engine.cleanup_mode() == CaptureMode::Off
        && matches!(engine.engine.state(), EngineState::Idle)
    {
        return Ok(());
    }

    emit_from(app, &engine, EngineState::Stopping);
    if let Err(reason) = cleanup_runtime(app, &engine).await {
        emit_failed(app, &engine, reason.clone());
        return Err(reason);
    }
    emit_from(app, &engine, EngineState::Idle);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn engine_state_at(dir: &std::path::Path) -> EngineAppState {
        EngineAppState {
            engine: std::sync::Arc::new(XrayEngine::new()),
            selected_node: Mutex::new(None),
            selected_key: Mutex::new(None),
            selected_endpoint: Mutex::new(None),
            capture_mode: Mutex::new(CaptureMode::Off),
            session_id: Mutex::new(None),
            traffic: Mutex::new(TrafficAccounting::default()),
            last_emitted: Mutex::new(EngineStatePayload {
                state: "idle".into(),
                reason: None,
                selected_node: None,
                selected_node_id: None,
                capture_mode: "off".into(),
            }),
            gate: AsyncMutex::new(()),
            selection_path: dir.join(SELECTION_FILE),
            runtime_session_path: dir.join(RUNTIME_SESSION_FILE),
            config_path: dir.join("xray-config.json"),
            socks_port: DEFAULT_SOCKS_PORT,
            api_port: DEFAULT_API_PORT,
        }
    }

    #[test]
    fn failed_payload_shape_matches_event() {
        let payload = EngineStatePayload {
            state: "failed".into(),
            reason: Some("build_config boom".into()),
            selected_node: Some("n1".into()),
            selected_node_id: Some("n2:deadbeef".into()),
            capture_mode: "off".into(),
        };
        assert_eq!(payload.state, "failed");
        assert_eq!(payload.reason.as_deref(), Some("build_config boom"));
    }

    #[test]
    fn runtime_marker_preserves_cleanup_mode_after_memory_reset() {
        let dir = tempfile::tempdir().unwrap();
        let engine = engine_state_at(dir.path());

        engine.begin_capture(CaptureMode::Tun).unwrap();
        assert_eq!(engine.capture_mode(), CaptureMode::Tun);
        assert!(!engine.runtime_session_path.exists());

        engine.arm_runtime_cleanup().unwrap();
        assert_eq!(engine.persisted_capture_mode(), Some(CaptureMode::Tun));

        engine.finish_capture_cleanup(false);
        assert_eq!(engine.capture_mode(), CaptureMode::Off);
        assert_eq!(engine.cleanup_mode(), CaptureMode::Tun);

        engine.finish_capture_cleanup(true);
        assert_eq!(engine.cleanup_mode(), CaptureMode::Off);
        assert!(!engine.runtime_session_path.exists());
    }

    fn node_with_uuid(tag: &str, server: &str, uuid: &str) -> ProxyNode {
        let mut n = ProxyNode::new(tag, "vless", server, 443);
        n.uuid = Some(uuid.into());
        n
    }

    /// A renamed node is recovered by identity, keeping the same endpoint.
    #[test]
    fn remembered_selection_recovers_renamed_node_by_identity() {
        let renamed = node_with_uuid("电信-69.68mb/s", "example.com", "uuid-1");
        let nodes = vec![
            node_with_uuid("联通-0.52mb/s", "other.example", "uuid-2"),
            renamed,
        ];
        let key = node_key(&node_with_uuid("电信-60.48mb/s", "example.com", "uuid-1"));

        let picked = pick_node(
            &nodes,
            NodeQuery::remembered(Some(&key), None, Some("电信-60.48mb/s")),
        )
        .unwrap();
        assert_eq!(picked.tag, "电信-69.68mb/s");
    }

    /// 1.0.1 wrote the identity as a plaintext `protocol|server|port|secret`
    /// tuple. Upgrading must not invalidate it — that is precisely the kind of
    /// data-format break this whole scheme exists to prevent.
    #[test]
    fn remembered_selection_accepts_legacy_key_format() {
        let nodes = vec![
            node_with_uuid("联通-0.52mb/s", "other.example", "uuid-2"),
            node_with_uuid("电信-69.68mb/s", "example.com", "uuid-1"),
        ];

        let picked = pick_node(
            &nodes,
            NodeQuery::remembered(
                Some("vless|example.com|443|uuid-1"),
                None,
                Some("电信-60.48mb/s"),
            ),
        )
        .unwrap();
        assert_eq!(picked.tag, "电信-69.68mb/s");
    }

    /// Providers rotate credentials on the same endpoint; the selection should
    /// follow the server rather than fall all the way through to node #1.
    #[test]
    fn remembered_selection_recovers_by_endpoint_after_credential_rotation() {
        let nodes = vec![
            node_with_uuid("香港01", "hk.example", "uuid-new"),
            node_with_uuid("日本01", "jp.example", "uuid-2"),
        ];
        let stale = node_with_uuid("香港01", "hk.example", "uuid-old");

        let picked = pick_node(
            &nodes,
            NodeQuery::remembered(
                Some(&node_key(&stale)),
                Some(&node_endpoint(&stale)),
                Some("已改名"),
            ),
        )
        .unwrap();
        assert_eq!(picked.server, "hk.example");
    }

    /// The deadlock this guards: nothing about the remembered selection matches
    /// anymore, and the home screen only exposes the node list once connected —
    /// so erroring would leave the user permanently stuck.
    #[test]
    fn remembered_selection_falls_back_instead_of_erroring() {
        let nodes = vec![
            node_with_uuid("电信-69.68mb/s", "example.com", "uuid-1"),
            node_with_uuid("联通-0.52mb/s", "other.example", "uuid-2"),
        ];

        let picked = pick_node(
            &nodes,
            NodeQuery::remembered(None, None, Some("已删除的节点")),
        )
        .unwrap();
        assert_eq!(picked.tag, "电信-69.68mb/s");

        // Nothing remembered at all (fresh install, quarantined file) also
        // yields a connection rather than an error.
        let picked = pick_node(&nodes, NodeQuery::remembered(None, None, None)).unwrap();
        assert_eq!(picked.tag, "电信-69.68mb/s");
    }

    /// An explicit pick from the node list must never silently land elsewhere.
    #[test]
    fn explicit_pick_never_falls_back() {
        let nodes = vec![node_with_uuid("电信-69.68mb/s", "example.com", "uuid-1")];

        assert_eq!(
            pick_node(
                &nodes,
                NodeQuery {
                    key: Some("n2:0000"),
                    alt_key: None,
                    endpoint: None,
                    tag: Some("已删除的节点"),
                    allow_fallback: false,
                }
            ),
            Err("node_not_found:已删除的节点".into())
        );
    }

    /// The id the UI sends resolves even when the row's label went stale
    /// between render and tap.
    #[test]
    fn explicit_pick_resolves_by_id_when_tag_is_stale() {
        let node = node_with_uuid("电信-69.68mb/s", "example.com", "uuid-1");
        let nodes = vec![node.clone()];

        let picked = pick_node(
            &nodes,
            NodeQuery {
                key: Some(&node_key(&node)),
                alt_key: None,
                endpoint: None,
                tag: Some("电信-60.48mb/s"),
                allow_fallback: false,
            },
        )
        .unwrap();
        assert_eq!(picked.tag, "电信-69.68mb/s");
    }

    /// Providers that embed live speed in the node name rename every node on
    /// each sync; a selection remembered only by tag would break every time.
    #[test]
    fn selection_round_trips_through_disk_in_current_format() {
        let dir = tempfile::tempdir().unwrap();
        let engine = engine_state_at(dir.path());

        let before = node_with_uuid("电信-60.48mb/s", "example.com", "uuid-1");
        engine.set_selected(&before).unwrap();

        let stored = read_selection(&engine.selection_path);
        assert_eq!(stored.schema_version, SELECTION_SCHEMA_VERSION);
        assert_eq!(stored.selected_node.as_deref(), Some("电信-60.48mb/s"));
        assert_eq!(stored.selected_key.as_deref(), Some(node_key(&before).as_str()));
        assert_eq!(
            stored.selected_endpoint.as_deref(),
            Some(node_endpoint(&before).as_str())
        );
        // The persisted key must not carry the node credential to disk in
        // plaintext the way the 1.0.1 format did.
        assert!(!stored.selected_key.unwrap().contains("uuid-1"));
    }

    #[test]
    fn selection_file_without_key_still_loads() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(SELECTION_FILE);
        fs::write(&path, r#"{"selectedNode":"n1"}"#).unwrap();

        let loaded = read_selection(&path);
        assert_eq!(loaded.selected_node.as_deref(), Some("n1"));
        assert_eq!(loaded.selected_key, None);
    }

    /// Forward compatibility: a file written by a *newer* build must not be
    /// rejected for carrying fields this build has never heard of.
    #[test]
    fn selection_file_from_a_newer_build_still_loads() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(SELECTION_FILE);
        fs::write(
            &path,
            r#"{"schemaVersion":99,"selectedNode":"n1","selectedKey":"n9:abc","futureField":{"x":1}}"#,
        )
        .unwrap();

        let loaded = read_selection(&path);
        assert_eq!(loaded.selected_node.as_deref(), Some("n1"));
        assert_eq!(loaded.selected_key.as_deref(), Some("n9:abc"));
    }

    /// A truncated or hand-edited file must degrade to "nothing remembered",
    /// never to a failed app start.
    #[test]
    fn corrupt_selection_file_is_quarantined_not_fatal() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(SELECTION_FILE);
        fs::write(&path, "{\"selectedNode\": \"n1\"").unwrap();

        let loaded = read_selection(&path);
        assert_eq!(loaded.selected_node, None);
        assert!(!path.exists(), "bad file should be moved aside");
        let quarantined = fs::read_dir(dir.path())
            .unwrap()
            .filter_map(Result::ok)
            .any(|e| e.file_name().to_string_lossy().contains(".corrupt-"));
        assert!(quarantined, "bad file should be kept for diagnosis");
    }

    /// Golden shapes that must keep resolving. Deleting an alias or making a
    /// field required will fail these — that is the compatibility contract.
    #[test]
    fn selection_fixtures_from_every_shipped_format_still_resolve() {
        let renamed = node_with_uuid("电信-69.68mb/s", "example.com", "uuid-1");
        let other = node_with_uuid("联通-0.52mb/s", "other.example", "uuid-2");
        let nodes = vec![other, renamed.clone()];

        // 1.0.0 — tag only. The name has since been rewritten by the provider.
        let v100 = pick_node(
            &nodes,
            NodeQuery::remembered(None, None, Some("电信-60.48mb/s")),
        )
        .unwrap();
        assert_eq!(
            v100.tag, "联通-0.52mb/s",
            "tag-only files cannot recover a rename; fallback must still connect"
        );

        // 1.0.1 — plaintext identity. Must recover the renamed node.
        let v101 = pick_node(
            &nodes,
            NodeQuery::remembered(
                Some("vless|example.com|443|uuid-1"),
                None,
                Some("电信-60.48mb/s"),
            ),
        )
        .unwrap();
        assert_eq!(v101.tag, "电信-69.68mb/s");

        // Current — hashed key + endpoint.
        let current = pick_node(
            &nodes,
            NodeQuery::remembered(
                Some(&node_key(&renamed)),
                Some(&node_endpoint(&renamed)),
                Some("电信-60.48mb/s"),
            ),
        )
        .unwrap();
        assert_eq!(current.tag, "电信-69.68mb/s");
    }

    /// A stale id from an older UI must not hide the remembered 1.0.1 key.
    #[test]
    fn stale_requested_id_does_not_mask_remembered_identity() {
        let target = node_with_uuid("电信-69.68mb/s", "example.com", "uuid-1");
        let nodes = vec![
            node_with_uuid("联通-0.52mb/s", "other.example", "uuid-2"),
            target,
        ];

        let picked = pick_node(
            &nodes,
            NodeQuery {
                key: Some("n2:0000deadbeef"),
                alt_key: Some("vless|example.com|443|uuid-1"),
                endpoint: None,
                tag: Some("电信-60.48mb/s"),
                allow_fallback: true,
            },
        )
        .unwrap();
        assert_eq!(picked.tag, "电信-69.68mb/s");
    }

    /// Loading a 1.0.1 file and calling set_selected rewrites the current form.
    #[test]
    fn set_selected_rewrites_legacy_file_to_current_format() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(SELECTION_FILE);
        fs::write(
            &path,
            r#"{"selectedNode":"电信-60.48mb/s","selectedKey":"vless|example.com|443|uuid-1"}"#,
        )
        .unwrap();

        let engine = engine_state_at(dir.path());
        let loaded = read_selection(&path);
        assert_eq!(
            loaded.selected_key.as_deref(),
            Some("vless|example.com|443|uuid-1")
        );

        let now = node_with_uuid("电信-69.68mb/s", "example.com", "uuid-1");
        engine.set_selected(&now).unwrap();

        let stored = read_selection(&engine.selection_path);
        assert_eq!(stored.schema_version, SELECTION_SCHEMA_VERSION);
        assert_eq!(stored.selected_node.as_deref(), Some("电信-69.68mb/s"));
        assert_eq!(stored.selected_key.as_deref(), Some(node_key(&now).as_str()));
        assert_eq!(
            stored.selected_endpoint.as_deref(),
            Some(node_endpoint(&now).as_str())
        );
        assert!(!stored.selected_key.unwrap().contains("uuid-1"));
    }

    #[test]
    fn begin_capture_rejects_off_without_writing_marker() {
        let dir = tempfile::tempdir().unwrap();
        let engine = engine_state_at(dir.path());

        assert_eq!(
            engine.begin_capture(CaptureMode::Off),
            Err("invalid_capture_mode".into())
        );
        assert_eq!(engine.capture_mode(), CaptureMode::Off);
        assert!(!engine.runtime_session_path.exists());
    }

    #[test]
    fn traffic_accounting_reports_only_new_bytes() {
        let mut accounting = TrafficAccounting {
            current: Some(TrafficSession {
                subscription_id: "sub-1".into(),
                outbound_tag: "node-1".into(),
                observed: TrafficStats::default(),
            }),
            pending: HashMap::new(),
        };

        accounting.record_observation(TrafficStats {
            upload: 100,
            download: 1_000,
        });
        accounting.acknowledge(
            "sub-1",
            TrafficStats {
                upload: 100,
                download: 1_000,
            },
        );
        accounting.record_observation(TrafficStats {
            upload: 150,
            download: 1_300,
        });

        assert_eq!(
            accounting.pending.get("sub-1"),
            Some(&TrafficStats {
                upload: 50,
                download: 300,
            })
        );
    }

    #[test]
    fn pending_traffic_payload_is_stable_and_excludes_empty_entries() {
        let dir = tempfile::tempdir().unwrap();
        let engine = engine_state_at(dir.path());
        {
            let mut accounting = engine.traffic.lock().unwrap();
            accounting.pending.insert(
                "sub-b".into(),
                TrafficStats {
                    upload: 20,
                    download: 200,
                },
            );
            accounting
                .pending
                .insert("sub-empty".into(), TrafficStats::default());
            accounting.pending.insert(
                "sub-a".into(),
                TrafficStats {
                    upload: 10,
                    download: 100,
                },
            );
        }

        assert_eq!(
            engine.pending_traffic_payload(),
            TrafficLocalUpdatedPayload {
                pending: vec![
                    PendingTrafficPayload {
                        subscription_id: "sub-a".into(),
                        upload: 10,
                        download: 100,
                    },
                    PendingTrafficPayload {
                        subscription_id: "sub-b".into(),
                        upload: 20,
                        download: 200,
                    },
                ],
            }
        );
    }
}
