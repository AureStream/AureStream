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
        let session = read_json_opt(&path)?;
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
        let user = session.user.clone();
        write_json(&self.path, &session)?;
        let mut guard = self
            .inner
            .lock()
            .map_err(|_| "auth state lock poisoned".to_string())?;
        *guard = Some(session);
        Ok(user)
    }

    pub fn clear(&self) -> Result<(), String> {
        if self.path.exists() {
            fs::remove_file(&self.path).map_err(|e| format!("remove session: {e}"))?;
        }
        let mut guard = self
            .inner
            .lock()
            .map_err(|_| "auth state lock poisoned".to_string())?;
        *guard = None;
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
    /// No-op if the session was cleared (e.g. logout raced the refresh) —
    /// re-storing tokens there would resurrect a session the user ended.
    pub fn update_tokens(&self, tokens: &RefreshedTokens) -> Result<(), String> {
        let mut guard = self
            .inner
            .lock()
            .map_err(|_| "auth state lock poisoned".to_string())?;
        let Some(session) = guard.as_mut() else {
            return Ok(());
        };
        session.access_token = tokens.access_token.clone();
        session.refresh_token = tokens.refresh_token.clone();
        session.expires_in = tokens.expires_in;
        write_json(&self.path, session)
    }

    /// Load session from disk into memory (idempotent).
    pub fn restore_from_disk(&self) -> Option<User> {
        match read_json_opt::<StoredSession>(&self.path) {
            Ok(Some(session)) => {
                let user = session.user.clone();
                if let Ok(mut guard) = self.inner.lock() {
                    *guard = Some(session);
                }
                Some(user)
            }
            _ => None,
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
        self.update_tokens(&tokens).map_err(|e| {
            log::error!("persist refreshed tokens: {e}");
            aurestream_api_client::ApiError::from_code("request_failed", 0, None)
        })?;
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
    let raw =
        serde_json::to_string_pretty(value).map_err(|e| format!("serialize {}: {e}", path.display()))?;
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

        auth.update_tokens(&RefreshedTokens {
            access_token: "new-access".into(),
            refresh_token: "new-refresh".into(),
            expires_in: 7200,
        })
        .unwrap();

        assert_eq!(auth.access_token().unwrap(), "new-access");
        // The rotated refresh token must survive a restart, else the session
        // can never be renewed again.
        let reloaded = AuthState::with_path(path).unwrap();
        assert_eq!(reloaded.refresh_token().unwrap(), "new-refresh");
    }

    #[test]
    fn update_tokens_does_not_resurrect_cleared_session() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("s.json");
        let auth = session_at(&path, "old-access", "old-refresh");

        auth.clear().unwrap();
        auth.update_tokens(&RefreshedTokens {
            access_token: "new-access".into(),
            refresh_token: "new-refresh".into(),
            expires_in: 7200,
        })
        .unwrap();

        assert!(auth.access_token().is_none());
        assert!(!path.exists(), "logout must win the race with a refresh");
    }
}
