//! Persisted auth session + subscription cache under the app data directory.
//!
//! I/O rules live in [`crate::persist`]. Identity of a node is
//! [`crate::node_key`], never a display tag. `nodes` is a decoded *view* of
//! `bodies` and is rebuilt on load so a cache from an older build cannot hand
//! the UI identifiers the current process cannot resolve.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use aurestream_api_client::{AuthTokens, RefreshedTokens, User};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::persist::{read_json_opt, write_json};

const SESSION_FILE: &str = "auth-session.json";
const SUBS_FILE: &str = "subs.json";

/// Bump when the *meaning* of a stored field changes (a new field alone does
/// not need it — additions are already backward compatible by rule 1).
pub const SUBS_SCHEMA_VERSION: u32 = 2;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct NodeInfo {
    /// Stable identity (see `crate::node_key`). The only value the UI, the
    /// persisted selection and the latency cache may key a node by — `tag`
    /// and `name` are provider-controlled display text that changes on every
    /// sync. Empty in caches written before this field existed; backfilled
    /// from the subscription body on load.
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub tag: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub protocol: String,
    /// Server host for TCP latency probe (and display).
    #[serde(default)]
    pub server: String,
    /// Server port for TCP latency probe.
    #[serde(default)]
    pub port: u16,
}

fn default_user() -> User {
    User {
        id: String::new(),
        email: String::new(),
        created_at: 0,
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredSession {
    #[serde(default)]
    pub access_token: String,
    #[serde(default)]
    pub refresh_token: String,
    #[serde(default)]
    pub expires_in: u64,
    #[serde(default = "default_user")]
    pub user: User,
}

impl From<AuthTokens> for StoredSession {
    fn from(tokens: AuthTokens) -> Self {
        Self {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_in: tokens.expires_in,
            user: tokens.user,
        }
    }
}

impl StoredSession {
    fn has_complete_token_pair(&self) -> bool {
        !self.access_token.trim().is_empty() && !self.refresh_token.trim().is_empty()
    }
}

pub struct AuthState {
    inner: Mutex<Option<StoredSession>>,
    path: PathBuf,
    /// Serializes token refresh. The server rotates refresh tokens, so two
    /// concurrent refreshes would race and one would be left holding a token
    /// the server already deleted.
    refresh_gate: tokio::sync::Mutex<()>,
}

impl AuthState {
    /// Build over an explicit session file (tests / non-Tauri callers).
    fn with_path(path: PathBuf) -> Result<Self, String> {
        let session =
            read_json_opt::<StoredSession>(&path)?.filter(StoredSession::has_complete_token_pair);
        Ok(Self {
            inner: Mutex::new(session),
            path,
            refresh_gate: tokio::sync::Mutex::new(()),
        })
    }

    pub fn load(app: &AppHandle) -> Result<Self, String> {
        let dir = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("app data dir: {e}"))?;
        fs::create_dir_all(&dir).map_err(|e| format!("create app data dir: {e}"))?;
        Self::with_path(dir.join(SESSION_FILE))
    }

    pub fn save(&self, tokens: AuthTokens) -> Result<User, String> {
        let session = StoredSession::from(tokens);
        if !session.has_complete_token_pair() {
            return Err("missing_auth_tokens".to_string());
        }
        let user = session.user.clone();
        // Same ordering discipline as `clear`: hold the lock across the write so
        // a concurrent clear can't land between the file write and the memory
        // update, leaving an orphaned session file behind.
        let mut guard = self
            .inner
            .lock()
            .map_err(|_| "auth state lock poisoned".to_string())?;
        write_json(&self.path, &session)?;
        *guard = Some(session);
        Ok(user)
    }

    pub fn clear(&self) -> Result<(), String> {
        // Take the lock for the whole operation: a refresh landing between the
        // file delete and the memory clear would see `Some(session)` and write
        // the file back, resurrecting a session the user ended.
        let mut guard = self
            .inner
            .lock()
            .map_err(|_| "auth state lock poisoned".to_string())?;
        *guard = None;
        if self.path.exists() {
            fs::remove_file(&self.path).map_err(|e| format!("remove session: {e}"))?;
        }
        Ok(())
    }

    pub fn access_token(&self) -> Option<String> {
        self.inner
            .lock()
            .ok()
            .and_then(|guard| guard.as_ref().map(|s| s.access_token.clone()))
    }

    pub fn refresh_token(&self) -> Option<String> {
        self.inner
            .lock()
            .ok()
            .and_then(|guard| guard.as_ref().map(|s| s.refresh_token.clone()))
    }

    /// Persist a rotated token pair, keeping the existing user.
    ///
    /// Returns `false` without storing anything if the session was cleared
    /// (e.g. logout raced the refresh) — re-storing tokens there would
    /// resurrect a session the user ended.
    pub fn update_tokens(&self, tokens: &RefreshedTokens) -> Result<bool, String> {
        if tokens.access_token.trim().is_empty() || tokens.refresh_token.trim().is_empty() {
            return Err("missing_auth_tokens".to_string());
        }
        let mut guard = self
            .inner
            .lock()
            .map_err(|_| "auth state lock poisoned".to_string())?;
        let Some(session) = guard.as_mut() else {
            return Ok(false);
        };
        session.access_token = tokens.access_token.clone();
        session.refresh_token = tokens.refresh_token.clone();
        session.expires_in = tokens.expires_in;
        write_json(&self.path, session)?;
        Ok(true)
    }

    /// Load session from disk into memory (idempotent).
    pub fn restore_from_disk(&self) -> Option<User> {
        match read_json_opt::<StoredSession>(&self.path) {
            Ok(Some(session)) if session.has_complete_token_pair() => {
                let user = session.user.clone();
                if let Ok(mut guard) = self.inner.lock() {
                    *guard = Some(session);
                }
                Some(user)
            }
            _ => {
                if let Ok(mut guard) = self.inner.lock() {
                    *guard = None;
                }
                None
            }
        }
    }

    /// Refresh the access token, collapsing concurrent callers into one call.
    ///
    /// Returns the new access token. Because the server rotates refresh tokens,
    /// waiters that arrive while a refresh is in flight do NOT issue their own —
    /// they take the token the winner stored.
    pub async fn refresh_access_token(
        &self,
        client: &aurestream_api_client::ApiClient,
        stale: &str,
    ) -> Result<String, aurestream_api_client::ApiError> {
        let _guard = self.refresh_gate.lock().await;

        // Someone refreshed while we waited — their token is already current.
        match self.access_token() {
            Some(current) if current != stale => return Ok(current),
            None => {
                return Err(aurestream_api_client::ApiError::from_code(
                    "not_authenticated",
                    401,
                    None,
                ))
            }
            _ => {}
        }

        let refresh_token = self.refresh_token().ok_or_else(|| {
            aurestream_api_client::ApiError::from_code("not_authenticated", 401, None)
        })?;

        let tokens = client.refresh(&refresh_token).await?;
        let access = tokens.access_token.clone();
        let stored = self.update_tokens(&tokens).map_err(|e| {
            log::error!("persist refreshed tokens: {e}");
            aurestream_api_client::ApiError::from_code("request_failed", 0, None)
        })?;
        if !stored {
            // Logout won the race. The server already rotated, so the pair we
            // just minted is deliberately discarded — handing the caller a
            // token nothing persisted would let it act on a dead session.
            log::info!("refresh discarded: session cleared during refresh");
            return Err(aurestream_api_client::ApiError::from_code(
                "not_authenticated",
                401,
                None,
            ));
        }
        log::info!("access token refreshed");
        Ok(access)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SubSummary {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub traffic_used: u64,
    #[serde(default)]
    pub traffic_total: u64,
    #[serde(default)]
    pub expire_time: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SubsSnapshot {
    /// Format of this file. Written as [`SUBS_SCHEMA_VERSION`], `0` when the
    /// file predates the field. Every field below is `#[serde(default)]` so a
    /// file from any version still loads — see the module docs.
    #[serde(default)]
    pub schema_version: u32,
    #[serde(default)]
    pub subscriptions: Vec<SubSummary>,
    #[serde(default)]
    pub active_id: Option<String>,
    #[serde(default)]
    pub nodes: Vec<NodeInfo>,
    /// Raw provider bodies keyed by subscription id. The source of truth for
    /// nodes: `nodes` is a decoded view that is rebuilt from these on load.
    #[serde(default)]
    pub bodies: HashMap<String, String>,
}

pub struct SubsState {
    inner: Mutex<SubsSnapshot>,
    path: PathBuf,
    operation_gate: tokio::sync::Mutex<()>,
}

impl SubsState {
    pub fn load(app: &AppHandle) -> Result<Self, String> {
        let dir = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("app data dir: {e}"))?;
        fs::create_dir_all(&dir).map_err(|e| format!("create app data dir: {e}"))?;
        let path = dir.join(SUBS_FILE);
        let snapshot: SubsSnapshot = read_json_opt(&path)?.unwrap_or_default();
        // Caches written before node ids existed (or by a build with different
        // decode rules) would hand the UI ids the engine cannot resolve. The
        // bodies are the source of truth, so re-derive the view from them.
        let snapshot = rebuild_nodes(snapshot);
        Ok(Self {
            inner: Mutex::new(snapshot),
            path,
            operation_gate: tokio::sync::Mutex::new(()),
        })
    }

    /// Serialize remote sync and usage reporting so an older list response
    /// cannot overwrite a just-reported traffic total.
    pub async fn lock_operations(&self) -> tokio::sync::MutexGuard<'_, ()> {
        self.operation_gate.lock().await
    }

    pub fn snapshot(&self) -> Result<SubsSnapshot, String> {
        let guard = self
            .inner
            .lock()
            .map_err(|_| "subs state lock poisoned".to_string())?;
        Ok(guard.clone())
    }

    pub fn replace(&self, snapshot: SubsSnapshot) -> Result<(), String> {
        let mut snapshot = snapshot;
        snapshot.schema_version = SUBS_SCHEMA_VERSION;
        write_json(&self.path, &snapshot)?;
        let mut guard = self
            .inner
            .lock()
            .map_err(|_| "subs state lock poisoned".to_string())?;
        *guard = snapshot;
        Ok(())
    }

    pub fn update_traffic(
        &self,
        subscription_id: &str,
        traffic_used: u64,
        traffic_total: u64,
    ) -> Result<SubsSnapshot, String> {
        let mut guard = self
            .inner
            .lock()
            .map_err(|_| "subs state lock poisoned".to_string())?;
        let subscription = guard
            .subscriptions
            .iter_mut()
            .find(|sub| sub.id == subscription_id)
            .ok_or_else(|| "subscription_not_found".to_string())?;
        subscription.traffic_used = traffic_used;
        subscription.traffic_total = traffic_total;
        guard.schema_version = SUBS_SCHEMA_VERSION;
        write_json(&self.path, &*guard)?;
        Ok(guard.clone())
    }
}

/// Re-decode the active subscription's nodes from its raw body.
///
/// The decoded `nodes` list is a *cache* of what `bodies` says. Trusting the
/// cached copy across versions means the UI can hold node ids (or tags) the
/// engine's own decode no longer produces, which is exactly how a selection
/// stops resolving. Rebuilding on load keeps both sides on one decode.
fn rebuild_nodes(mut snapshot: SubsSnapshot) -> SubsSnapshot {
    let Some(body) = snapshot
        .active_id
        .as_ref()
        .and_then(|id| snapshot.bodies.get(id))
    else {
        // No body to decode from: keep the cached list as-is, including
        // pre-id entries from 1.0.0. Wiping them would hide nodes the user
        // still has until the next successful sync.
        return snapshot;
    };
    let decoded = crate::commands::subs_parse::extract_nodes_from_body(body);
    if decoded.is_empty() && !snapshot.nodes.is_empty() {
        // Decode regression (unsupported format) — do not blank a working list.
        log::warn!("subs cache: body decoded to zero nodes, keeping cached list");
        return snapshot;
    }
    snapshot.nodes = decoded;
    snapshot
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::persist::{read_json_opt, write_json};

    fn session_at(path: &PathBuf, access: &str, refresh: &str) -> AuthState {
        let session = StoredSession {
            access_token: access.to_string(),
            refresh_token: refresh.to_string(),
            expires_in: 7200,
            user: User {
                id: "u1".into(),
                email: "a@b.c".into(),
                created_at: 0,
            },
        };
        write_json(path, &session).unwrap();
        AuthState::with_path(path.clone()).unwrap()
    }

    /// Rule 2: an unreadable state file must degrade to defaults, never abort
    /// app setup — a user cannot fix JSON in an app that will not launch.
    #[test]
    fn corrupt_state_file_yields_defaults_and_is_quarantined() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("subs.json");
        fs::write(&path, "{ not json").unwrap();

        let loaded: Option<SubsSnapshot> = read_json_opt(&path).unwrap();
        assert!(loaded.is_none());
        assert!(!path.exists());
        assert!(fs::read_dir(dir.path())
            .unwrap()
            .filter_map(Result::ok)
            .any(|e| e.file_name().to_string_lossy().contains(".corrupt-")));
    }

    /// Rule 1: a cache written by an older build (no `id`, no `schemaVersion`)
    /// and one written by a newer build (unknown fields) both load.
    #[test]
    fn subs_cache_loads_from_older_and_newer_formats() {
        let dir = tempfile::tempdir().unwrap();

        let legacy = dir.path().join("legacy.json");
        fs::write(
            &legacy,
            r#"{"subscriptions":[],"activeId":null,"nodes":[{"tag":"n1","name":"n1","protocol":"vless"}]}"#,
        )
        .unwrap();
        let loaded: SubsSnapshot = read_json_opt(&legacy).unwrap().unwrap();
        assert_eq!(loaded.schema_version, 0);
        assert_eq!(loaded.nodes[0].id, "");

        let future = dir.path().join("future.json");
        fs::write(
            &future,
            r#"{"schemaVersion":99,"nodes":[{"id":"n2:abc","tag":"n1","name":"n1","protocol":"vless","somethingNew":true}],"unknownTop":[1]}"#,
        )
        .unwrap();
        let loaded: SubsSnapshot = read_json_opt(&future).unwrap().unwrap();
        assert_eq!(loaded.nodes[0].id, "n2:abc");
    }

    /// Node ids are re-derived from the raw body, so a cache from a build that
    /// never wrote them (or wrote them differently) still hands the UI ids the
    /// engine can resolve.
    #[test]
    fn rebuild_nodes_backfills_ids_from_body() {
        let mut bodies = HashMap::new();
        bodies.insert("sub-1".to_string(), "vless://u@example.com:443#HK-1\n".to_string());
        let snapshot = rebuild_nodes(SubsSnapshot {
            active_id: Some("sub-1".into()),
            bodies,
            nodes: vec![NodeInfo {
                tag: "HK-1".into(),
                name: "HK-1".into(),
                ..NodeInfo::default()
            }],
            ..SubsSnapshot::default()
        });

        assert_eq!(snapshot.nodes.len(), 1);
        assert!(!snapshot.nodes[0].id.is_empty());
        assert_eq!(snapshot.nodes[0].server, "example.com");
    }

    /// A decode regression must not blank a working node list.
    #[test]
    fn rebuild_nodes_keeps_cached_list_when_body_decodes_to_nothing() {
        let mut bodies = HashMap::new();
        bodies.insert("sub-1".to_string(), "not a subscription".to_string());
        let snapshot = rebuild_nodes(SubsSnapshot {
            active_id: Some("sub-1".into()),
            bodies,
            nodes: vec![NodeInfo {
                id: "n2:abc".into(),
                tag: "HK-1".into(),
                ..NodeInfo::default()
            }],
            ..SubsSnapshot::default()
        });

        assert_eq!(snapshot.nodes.len(), 1);
        assert_eq!(snapshot.nodes[0].id, "n2:abc");
    }

    /// 1.0.0 wrote nodes without `id`. A body we cannot decode must not wipe them.
    #[test]
    fn rebuild_nodes_keeps_pre_id_cache_when_body_decodes_to_nothing() {
        let mut bodies = HashMap::new();
        bodies.insert("sub-1".to_string(), "not a subscription".to_string());
        let snapshot = rebuild_nodes(SubsSnapshot {
            active_id: Some("sub-1".into()),
            bodies,
            nodes: vec![NodeInfo {
                tag: "HK-1".into(),
                name: "HK-1".into(),
                ..NodeInfo::default()
            }],
            ..SubsSnapshot::default()
        });

        assert_eq!(snapshot.nodes.len(), 1);
        assert_eq!(snapshot.nodes[0].tag, "HK-1");
        assert!(snapshot.nodes[0].id.is_empty());
    }

    /// A session written by a newer build (unknown fields) or an older one
    /// (missing `user` / tokens) must still deserialize.
    #[test]
    fn session_file_loads_from_older_and_newer_formats() {
        let dir = tempfile::tempdir().unwrap();

        let legacy = dir.path().join("legacy.json");
        fs::write(
            &legacy,
            r#"{"access_token":"a","refresh_token":"r","expires_in":1,"user":{"id":"u","email":"e","created_at":0}}"#,
        )
        .unwrap();
        let loaded: StoredSession = read_json_opt(&legacy).unwrap().unwrap();
        assert_eq!(loaded.access_token, "a");
        assert_eq!(loaded.user.id, "u");

        let future = dir.path().join("future.json");
        fs::write(
            &future,
            r#"{"access_token":"a","refresh_token":"r","expires_in":1,"user":{"id":"u","email":"e","created_at":0},"deviceBound":true}"#,
        )
        .unwrap();
        let loaded: StoredSession = read_json_opt(&future).unwrap().unwrap();
        assert_eq!(loaded.access_token, "a");

        let partial = dir.path().join("partial.json");
        fs::write(&partial, r#"{"access_token":"only-access"}"#).unwrap();
        let loaded: StoredSession = read_json_opt(&partial).unwrap().unwrap();
        assert_eq!(loaded.access_token, "only-access");
        assert!(loaded.refresh_token.is_empty());
        assert!(loaded.user.id.is_empty());
    }

    #[test]
    fn update_tokens_persists_rotation() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("s.json");
        let auth = session_at(&path, "old-access", "old-refresh");

        let stored = auth
            .update_tokens(&RefreshedTokens {
                access_token: "new-access".into(),
                refresh_token: "new-refresh".into(),
                expires_in: 7200,
            })
            .unwrap();

        assert!(stored, "a live session must report the pair as persisted");
        assert_eq!(auth.access_token().unwrap(), "new-access");
        // The rotated refresh token must survive a restart, else the session
        // can never be renewed again.
        let reloaded = AuthState::with_path(path).unwrap();
        assert_eq!(reloaded.refresh_token().unwrap(), "new-refresh");
    }

    #[test]
    fn incomplete_tokens_never_create_or_restore_authenticated_session() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("s.json");
        let auth = AuthState::with_path(path.clone()).unwrap();

        let result = auth.save(AuthTokens {
            access_token: "".into(),
            refresh_token: "refresh".into(),
            expires_in: 7200,
            user: User {
                id: "u1".into(),
                email: "a@b.c".into(),
                created_at: 0,
            },
        });
        assert_eq!(result.unwrap_err(), "missing_auth_tokens");
        assert!(!path.exists());
        assert!(auth.access_token().is_none());

        let invalid = StoredSession {
            access_token: "access".into(),
            refresh_token: "  ".into(),
            expires_in: 7200,
            user: User {
                id: "u1".into(),
                email: "a@b.c".into(),
                created_at: 0,
            },
        };
        write_json(&path, &invalid).unwrap();
        assert!(auth.restore_from_disk().is_none());
        assert!(auth.access_token().is_none());
    }

    #[test]
    fn clear_removes_file_and_memory_atomically() {
        // `clear` must null memory and delete the file under one lock hold:
        // a refresh observing `Some(session)` after the file was removed would
        // write it straight back and resurrect the session.
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("s.json");
        let auth = std::sync::Arc::new(session_at(&path, "old-access", "old-refresh"));

        // Hammer both sides so the delete/lock interleaving is actually sampled
        // rather than left to chance on one pass.
        let stop = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let writer = {
            let auth = auth.clone();
            let stop = stop.clone();
            std::thread::spawn(move || {
                while !stop.load(std::sync::atomic::Ordering::Relaxed) {
                    let _ = auth.update_tokens(&RefreshedTokens {
                        access_token: "new-access".into(),
                        refresh_token: "new-refresh".into(),
                        expires_in: 7200,
                    });
                }
            })
        };

        for _ in 0..500 {
            auth.save(AuthTokens {
                access_token: "old-access".into(),
                refresh_token: "old-refresh".into(),
                expires_in: 7200,
                user: User {
                    id: "u1".into(),
                    email: "a@b.c".into(),
                    created_at: 0,
                },
            })
            .unwrap();
            auth.clear().unwrap();
            assert!(
                !path.exists(),
                "session file resurrected by a concurrent refresh"
            );
        }
        stop.store(true, std::sync::atomic::Ordering::Relaxed);
        writer.join().unwrap();

        // Once cleared, no concurrent refresh may bring the session back.
        assert!(auth.access_token().is_none());
        assert!(!path.exists(), "session file resurrected after logout");
    }

    #[test]
    fn save_and_clear_never_disagree_on_disk() {
        // File write and memory update must be atomic in both directions, so
        // memory and disk can never end up claiming different things.
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("s.json");
        let auth = std::sync::Arc::new(session_at(&path, "a", "r"));

        let stop = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let saver = {
            let auth = auth.clone();
            let stop = stop.clone();
            std::thread::spawn(move || {
                while !stop.load(std::sync::atomic::Ordering::Relaxed) {
                    let _ = auth.save(AuthTokens {
                        access_token: "a".into(),
                        refresh_token: "r".into(),
                        expires_in: 7200,
                        user: User {
                            id: "u1".into(),
                            email: "a@b.c".into(),
                            created_at: 0,
                        },
                    });
                }
            })
        };

        for _ in 0..500 {
            auth.clear().unwrap();
            // Cleared memory must imply no file, checked while the saver races.
            if auth.access_token().is_none() {
                assert!(
                    !path.exists() || auth.access_token().is_some(),
                    "session file left behind with no in-memory session"
                );
            }
        }
        stop.store(true, std::sync::atomic::Ordering::Relaxed);
        saver.join().unwrap();
    }

    #[test]
    fn update_tokens_does_not_resurrect_cleared_session() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("s.json");
        let auth = session_at(&path, "old-access", "old-refresh");

        auth.clear().unwrap();
        let stored = auth
            .update_tokens(&RefreshedTokens {
                access_token: "new-access".into(),
                refresh_token: "new-refresh".into(),
                expires_in: 7200,
            })
            .unwrap();

        // Must report the discard, not a silent success: the caller has to know
        // the pair it just minted was thrown away.
        assert!(!stored);
        assert!(auth.access_token().is_none());
        assert!(!path.exists(), "logout must win the race with a refresh");
    }
}
