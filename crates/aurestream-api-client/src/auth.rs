use serde::{Deserialize, Serialize};

use crate::error::ApiError;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub email: String,
    pub created_at: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AuthTokens {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: u64,
    pub user: User,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RegisterPending {
    pub email: String,
    pub expires_in: u64,
}

#[derive(Debug, Serialize)]
struct LoginRequest<'a> {
    email: &'a str,
    password: &'a str,
}

#[derive(Debug, Serialize)]
struct RegisterRequest<'a> {
    email: &'a str,
    password: &'a str,
}

#[derive(Debug, Serialize)]
struct VerifyRegisterRequest<'a> {
    email: &'a str,
    code: &'a str,
}

#[derive(Debug, Deserialize)]
struct VerifyRegisterResponse {
    user: User,
}

pub(crate) async fn login(
    http: &reqwest::Client,
    base: &str,
    email: &str,
    password: &str,
) -> Result<AuthTokens, ApiError> {
    let url = format!("{base}/auth/login");
    let response = http
        .post(&url)
        .json(&LoginRequest { email, password })
        .send()
        .await
        .map_err(|_| ApiError::from_code("request_failed", 0, None))?;

    if !response.status().is_success() {
        return Err(ApiError::from_response(response).await);
    }

    response
        .json::<AuthTokens>()
        .await
        .map_err(|_| ApiError::from_code("request_failed", 0, None))
}

pub(crate) async fn register(
    http: &reqwest::Client,
    base: &str,
    email: &str,
    password: &str,
) -> Result<RegisterPending, ApiError> {
    let url = format!("{base}/auth/register");
    let response = http
        .post(&url)
        .json(&RegisterRequest { email, password })
        .send()
        .await
        .map_err(|_| ApiError::from_code("request_failed", 0, None))?;

    if !response.status().is_success() {
        return Err(ApiError::from_response(response).await);
    }

    response
        .json::<RegisterPending>()
        .await
        .map_err(|_| ApiError::from_code("request_failed", 0, None))
}

pub(crate) async fn verify_register(
    http: &reqwest::Client,
    base: &str,
    email: &str,
    code: &str,
) -> Result<User, ApiError> {
    let url = format!("{base}/auth/register/verify");
    let response = http
        .post(&url)
        .json(&VerifyRegisterRequest { email, code })
        .send()
        .await
        .map_err(|_| ApiError::from_code("request_failed", 0, None))?;

    if !response.status().is_success() {
        return Err(ApiError::from_response(response).await);
    }

    let body = response
        .json::<VerifyRegisterResponse>()
        .await
        .map_err(|_| ApiError::from_code("request_failed", 0, None))?;

    Ok(body.user)
}
