//! Persisted auth session (tokens + user) under the app data directory.

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use aurestream_api_client::{AuthTokens, User};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const SESSION_FILE: &str = "auth-session.json";

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
        let session = read_session(&path)?;
        Ok(Self {
            inner: Mutex::new(session),
            path,
        })
    }

    pub fn save(&self, tokens: AuthTokens) -> Result<User, String> {
        let session = StoredSession::from(tokens);
        let user = session.user.clone();
        write_session(&self.path, &session)?;
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

    /// Load session from disk into memory (idempotent).
    pub fn restore_from_disk(&self) -> Option<User> {
        match read_session(&self.path) {
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

fn read_session(path: &PathBuf) -> Result<Option<StoredSession>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(path).map_err(|e| format!("read session: {e}"))?;
    let session: StoredSession =
        serde_json::from_str(&raw).map_err(|e| format!("parse session: {e}"))?;
    Ok(Some(session))
}

fn write_session(path: &PathBuf, session: &StoredSession) -> Result<(), String> {
    let raw =
        serde_json::to_string_pretty(session).map_err(|e| format!("serialize session: {e}"))?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create session dir: {e}"))?;
    }
    fs::write(path, raw).map_err(|e| format!("write session: {e}"))
}
