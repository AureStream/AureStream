//! Persisted auth session + subscription cache under the app data directory.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use aurestream_api_client::{AuthTokens, User};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const SESSION_FILE: &str = "auth-session.json";
const SUBS_FILE: &str = "subs.json";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NodeInfo {
    pub tag: String,
    pub name: String,
    pub protocol: String,
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
}

impl AuthState {
    pub fn load(app: &AppHandle) -> Result<Self, String> {
        let dir = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("app data dir: {e}"))?;
        fs::create_dir_all(&dir).map_err(|e| format!("create app data dir: {e}"))?;
        let path = dir.join(SESSION_FILE);
        let session = read_json_opt(&path)?;
        Ok(Self {
            inner: Mutex::new(session),
            path,
        })
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
