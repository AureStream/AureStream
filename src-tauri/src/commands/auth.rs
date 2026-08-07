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
    let _ = app.emit(AUTH_CHANGED_EVENT, AuthChangedPayload { user });
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
    let user = state.save(tokens).map_err(|e| AuthIpcError {
        code: e,
        status: 0,
        retry_after: None,
    })?;
    log::info!("auth_login ok email={}", user.email);
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
    // Revoke server-side first, while the token is still readable. Best-effort:
    // the refresh token is valid for 30 days, so failing to revoke leaves a
    // live credential — but a network error must never block local logout.
    if let Some(refresh_token) = state.refresh_token() {
        if let Err(e) = api_client().logout(&refresh_token).await {
            log::warn!("auth_logout: server-side revoke failed: {e}");
        }
    }
    state.clear()?;
    log::info!("auth_logout");
    emit_auth_changed(&app, None);
    Ok(())
}

#[tauri::command]
pub async fn auth_restore(
    app: AppHandle,
    state: State<'_, AuthState>,
) -> Result<Option<User>, AuthIpcError> {
    let Some(user) = state.restore_from_disk() else {
        log::info!("auth_restore session=none");
        emit_auth_changed(&app, None);
        return Ok(None);
    };

    let stale_access = state.access_token().ok_or_else(|| AuthIpcError {
        code: "missing_auth_tokens".into(),
        status: 0,
        retry_after: None,
    })?;

    if let Err(err) = state
        .refresh_access_token(&api_client(), &stale_access)
        .await
    {
        log::warn!("auth_restore token verification failed: {err}");
        emit_auth_changed(&app, None);
        return Err(AuthIpcError::from(err));
    }

    log::info!("auth_restore session=verified");
    emit_auth_changed(&app, Some(user.clone()));
    Ok(Some(user))
}
