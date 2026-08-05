mod auth;
mod error;
mod subscriptions;

pub use auth::{AuthTokens, RegisterPending, User};
pub use error::ApiError;
pub use subscriptions::Subscription;

use auth::{login, register, verify_register};
use subscriptions::list_subscriptions;

pub const DEFAULT_BASE_URL: &str = "https://aurestream-api.chilix.ccwu.cc/api";

/// HTTP client for the AureStream Worker API.
pub struct ApiClient {
    base: String,
    http: reqwest::Client,
}

impl ApiClient {
    pub fn new() -> Self {
        Self::with_base(DEFAULT_BASE_URL)
    }

    pub fn with_base(base: impl Into<String>) -> Self {
        Self {
            base: base.into(),
            http: reqwest::Client::new(),
        }
    }

    pub fn base_url(&self) -> &str {
        &self.base
    }

    pub async fn login(&self, email: &str, password: &str) -> Result<AuthTokens, ApiError> {
        login(&self.http, &self.base, email, password).await
    }

    pub async fn register(&self, email: &str, password: &str) -> Result<RegisterPending, ApiError> {
        register(&self.http, &self.base, email, password).await
    }

    pub async fn verify_register(&self, email: &str, code: &str) -> Result<User, ApiError> {
        verify_register(&self.http, &self.base, email, code).await
    }

    pub async fn list_subscriptions(
        &self,
        access_token: &str,
    ) -> Result<Vec<Subscription>, ApiError> {
        list_subscriptions(&self.http, &self.base, access_token).await
    }
}

impl Default for ApiClient {
    fn default() -> Self {
        Self::new()
    }
}
