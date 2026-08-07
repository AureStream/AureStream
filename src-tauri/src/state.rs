//! Persisted auth session + subscription cache under the app data directory.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use aurestream_api_client::{AuthTokens, RefreshedTokens, User};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const SESSION_FILE: &str = "auth-session.json";
const SUBS_FILE: &str = "subs.json";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeInfo {
    pub tag: String,
    pub name: String,
    pub protocol: String,
    /// Server host for TCP latency probe (and display).
    #[serde(default)]
    pub server: String,
    /// Server port for TCP latency probe.
    #[serde(default)]
    pub port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredSession {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: u64,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubSummary {
    pub id: String,
    pub name: String,
    pub traffic_used: u64,
    pub traffic_total: u64,
    pub expire_time: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SubsSnapshot {
    pub subscriptions: Vec<SubSummary>,
    pub active_id: Option<String>,
    pub nodes: Vec<NodeInfo>,
    /// Raw provider bodies keyed by subscription id (for Task 6 decode).
    #[serde(default)]
    pub bodies: HashMap<String, String>,
}

pub struct SubsState {
    inner: Mutex<SubsSnapshot>,
    path: PathBuf,
}

impl SubsState {
    pub fn load(app: &AppHandle) -> Result<Self, String> {
        let dir = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("app data dir: {e}"))?;
        fs::create_dir_all(&dir).map_err(|e| format!("create app data dir: {e}"))?;
        let path = dir.join(SUBS_FILE);
        let snapshot = read_json_opt(&path)?.unwrap_or_default();
        Ok(Self {
            inner: Mutex::new(snapshot),
            path,
        })
    }

    pub fn snapshot(&self) -> Result<SubsSnapshot, String> {
        let guard = self
            .inner
            .lock()
            .map_err(|_| "subs state lock poisoned".to_string())?;
        Ok(guard.clone())
    }

    pub fn replace(&self, snapshot: SubsSnapshot) -> Result<(), String> {
        write_json(&self.path, &snapshot)?;
        let mut guard = self
            .inner
            .lock()
            .map_err(|_| "subs state lock poisoned".to_string())?;
        *guard = snapshot;
        Ok(())
    }
}

fn read_json_opt<T: for<'de> Deserialize<'de>>(path: &PathBuf) -> Result<Option<T>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(path).map_err(|e| format!("read {}: {e}", path.display()))?;
    let value = serde_json::from_str(&raw).map_err(|e| format!("parse {}: {e}", path.display()))?;
    Ok(Some(value))
}

fn write_json<T: Serialize>(path: &PathBuf, value: &T) -> Result<(), String> {
    let raw = serde_json::to_string_pretty(value)
        .map_err(|e| format!("serialize {}: {e}", path.display()))?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create dir: {e}"))?;
    }
    fs::write(path, raw).map_err(|e| format!("write {}: {e}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

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
