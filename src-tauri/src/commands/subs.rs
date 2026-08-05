//! Subscription sync IPC + `subs-updated` events.

use std::collections::HashMap;

use aurestream_api_client::{ApiClient, ApiError, Subscription};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::commands::subs_parse::extract_nodes_from_body;
use crate::state::{AuthState, NodeInfo, SubSummary, SubsSnapshot, SubsState};

pub const SUBS_UPDATED_EVENT: &str = "subs-updated";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubsUpdatedPayload {
    pub subscriptions: Vec<SubSummary>,
    pub active_id: Option<String>,
    pub nodes: Vec<NodeInfo>,
}

impl From<&SubsSnapshot> for SubsUpdatedPayload {
    fn from(snap: &SubsSnapshot) -> Self {
        Self {
            subscriptions: snap.subscriptions.clone(),
            active_id: snap.active_id.clone(),
            nodes: snap.nodes.clone(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct SubsIpcError {
    pub code: String,
    pub status: u16,
    pub retry_after: Option<u32>,
}

impl From<ApiError> for SubsIpcError {
    fn from(err: ApiError) -> Self {
        Self {
            code: err.code,
            status: err.status,
            retry_after: err.retry_after,
        }
    }
}

fn api_client() -> ApiClient {
    match std::env::var("AURESTREAM_API_BASE") {
        Ok(base) if !base.trim().is_empty() => ApiClient::with_base(base),
        _ => ApiClient::new(),
    }
}

fn emit_subs_updated(app: &AppHandle, snap: &SubsSnapshot) {
    let _ = app.emit(SUBS_UPDATED_EVENT, SubsUpdatedPayload::from(snap));
}

fn to_summary(sub: &Subscription) -> SubSummary {
    SubSummary {
        id: sub.id.clone(),
        name: sub.name.clone(),
        traffic_used: sub.traffic_used,
        traffic_total: sub.traffic_total,
        expire_time: sub.expire_time,
    }
}

fn pick_active_id(previous: Option<&str>, subscriptions: &[SubSummary]) -> Option<String> {
    if let Some(prev) = previous {
        if subscriptions.iter().any(|s| s.id == prev) {
            return Some(prev.to_string());
        }
    }
    subscriptions.first().map(|s| s.id.clone())
}

/// List cached subscriptions / nodes from local `subs.json` (no network).
#[tauri::command]
pub fn subs_list(subs: State<'_, SubsState>) -> Result<SubsUpdatedPayload, String> {
    let snap = subs.snapshot()?;
    Ok(SubsUpdatedPayload::from(&snap))
}

/// Pull Worker subscription list, download each provider body, persist, emit `subs-updated`.
#[tauri::command]
pub async fn subs_sync(
    app: AppHandle,
    auth: State<'_, AuthState>,
    subs: State<'_, SubsState>,
) -> Result<SubsUpdatedPayload, SubsIpcError> {
    let token = auth.access_token().ok_or(SubsIpcError {
        code: "not_authenticated".to_string(),
        status: 401,
        retry_after: None,
    })?;

    let client = api_client();
    let remote = client
        .list_subscriptions(&token)
        .await
        .map_err(SubsIpcError::from)?;

    let previous = subs.snapshot().unwrap_or_default();
    let summaries: Vec<SubSummary> = remote.iter().map(to_summary).collect();
    let active_id = pick_active_id(previous.active_id.as_deref(), &summaries);

    let mut bodies: HashMap<String, String> = HashMap::new();
    for sub in &remote {
        match client.fetch_subscription_body(&sub.url).await {
            Ok(body) => {
                bodies.insert(sub.id.clone(), body);
            }
            Err(err) => {
                // Keep prior body for this id if fetch fails so UI still has nodes.
                if let Some(prev) = previous.bodies.get(&sub.id) {
                    bodies.insert(sub.id.clone(), prev.clone());
                }
                let _ = err;
            }
        }
    }

    let nodes = active_id
        .as_ref()
        .and_then(|id| bodies.get(id))
        .map(|body| extract_nodes_from_body(body))
        .unwrap_or_default();

    let snapshot = SubsSnapshot {
        subscriptions: summaries,
        active_id,
        nodes,
        bodies,
    };

    subs.replace(snapshot.clone()).map_err(|e| SubsIpcError {
        code: e,
        status: 0,
        retry_after: None,
    })?;

    emit_subs_updated(&app, &snapshot);
    Ok(SubsUpdatedPayload::from(&snapshot))
}
