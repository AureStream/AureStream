use serde::{Deserialize, Serialize};

use crate::error::ApiError;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Subscription {
    pub id: String,
    pub name: String,
    pub url: String,
    pub traffic_used: u64,
    pub traffic_total: u64,
    pub expire_time: u64,
    pub created_at: u64,
}

#[derive(Debug, Deserialize)]
struct SubscriptionsResponse {
    subscriptions: Vec<Subscription>,
}

pub(crate) async fn list_subscriptions(
    http: &reqwest::Client,
    base: &str,
    access_token: &str,
) -> Result<Vec<Subscription>, ApiError> {
    let url = format!("{base}/subscriptions");
    let response = http
        .get(&url)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|_| ApiError::from_code("request_failed", 0, None))?;

    if !response.status().is_success() {
        return Err(ApiError::from_response(response).await);
    }

    let body = response
        .json::<SubscriptionsResponse>()
        .await
        .map_err(|_| ApiError::from_code("request_failed", 0, None))?;

    Ok(body.subscriptions)
}
