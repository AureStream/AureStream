//! Auth IPC: login / register / verify / logout / restore + `auth-changed` events.

use aurestream_api_client::{ApiClient, ApiError, RegisterPending, User};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::state::AuthState;

pub const AUTH_CHANGED_EVENT: &str = "auth-changed";

#[derive(Debug, Clone, Serialize)]
pub struct AuthChangedPayload {
    pub user: Option<User>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AuthIpcError {
    pub code: String,
    pub status: u16,
    pub retry_after: Option<u32>,
}

impl From<ApiError> for AuthIpcError {
    fn from(err: ApiError) -> Self {
        Self {
            code: err.code,
            status: err.status,
            retry_after: err.retry_after,
        }
    }
}

fn emit_auth_changed(app: &AppHandle, user: Option<User>) {
    let _ = app.emit(
        AUTH_CHANGED_EVENT,
        AuthChangedPayload { user },
    );
}

fn api_client() -> ApiClient {
    match std::env::var("AURESTREAM_API_BASE") {
        Ok(base) if !base.trim().is_empty() => ApiClient::with_base(base),
        _ => ApiClient::new(),
    }
}

#[tauri::command]
pub async fn auth_login(
    app: AppHandle,
    state: State<'_, AuthState>,
    email: String,
    password: String,
) -> Result<User, AuthIpcError> {
    let client = api_client();
    let tokens = client
        .login(email.trim(), &password)
        .await
        .map_err(AuthIpcError::from)?;
    let user = state
        .save(tokens)
        .map_err(|e| AuthIpcError {
            code: e,
            status: 0,
            retry_after: None,
        })?;
    emit_auth_changed(&app, Some(user.clone()));
    Ok(user)
}

#[tauri::command]
pub async fn auth_register(
    email: String,
    password: String,
) -> Result<RegisterPending, AuthIpcError> {
    let client = api_client();
    client
        .register(email.trim(), &password)
        .await
        .map_err(AuthIpcError::from)
}

#[tauri::command]
pub async fn auth_verify(email: String, code: String) -> Result<User, AuthIpcError> {
    let client = api_client();
    client
        .verify_register(email.trim(), code.trim())
        .await
        .map_err(AuthIpcError::from)
}

#[tauri::command]
pub async fn auth_logout(app: AppHandle, state: State<'_, AuthState>) -> Result<(), String> {
    state.clear()?;
    emit_auth_changed(&app, None);
    Ok(())
}

/// Kick off session restore without blocking the caller / webview load.
/// Completion is signaled via `auth-changed`.
#[tauri::command]
pub fn auth_restore(app: AppHandle, state: State<'_, AuthState>) -> Result<(), String> {
    let user = state.restore_from_disk();
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        // Yield so the invoke returns and the webview can paint first.
        emit_auth_changed(&handle, user);
    });
    Ok(())
}

pub fn spawn_initial_restore(app: &AppHandle, state: &AuthState) {
    let user = state.restore_from_disk();
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        emit_auth_changed(&handle, user);
    });
}
