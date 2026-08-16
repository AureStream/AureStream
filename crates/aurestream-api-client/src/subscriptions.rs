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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UsageResponse {
    pub traffic_used: u64,
    pub traffic_total: u64,
}

#[derive(Debug, Serialize)]
struct UsageRequest {
    upload: u64,
    download: u64,
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

/// HTTP GET the subscription provider URL and return the raw body text.
pub(crate) async fn fetch_subscription_body(
    http: &reqwest::Client,
    url: &str,
) -> Result<String, ApiError> {
    let response = http
        .get(url)
        .send()
        .await
        .map_err(|_| ApiError::from_code("request_failed", 0, None))?;

    if !response.status().is_success() {
        return Err(ApiError::from_code(
            "subscription_fetch_failed",
            response.status().as_u16(),
            None,
        ));
    }

    response
        .text()
        .await
        .map_err(|_| ApiError::from_code("request_failed", 0, None))
}

pub(crate) async fn report_subscription_usage(
    http: &reqwest::Client,
    base: &str,
    access_token: &str,
    subscription_id: &str,
    upload: u64,
    download: u64,
) -> Result<UsageResponse, ApiError> {
    let url = format!("{base}/subscriptions/{subscription_id}/usage");
    let response = http
        .post(&url)
        .bearer_auth(access_token)
        .json(&UsageRequest { upload, download })
        .send()
        .await
        .map_err(|_| ApiError::from_code("request_failed", 0, None))?;

    if !response.status().is_success() {
        return Err(ApiError::from_response(response).await);
    }

    response
        .json::<UsageResponse>()
        .await
        .map_err(|_| ApiError::from_code("request_failed", 0, None))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn usage_request_matches_worker_contract() {
        let value = serde_json::to_value(UsageRequest {
            upload: 1_048_576,
            download: 10_485_760,
        })
        .unwrap();

        assert_eq!(value["upload"], 1_048_576);
        assert_eq!(value["download"], 10_485_760);
    }

    #[test]
    fn usage_response_ignores_worker_status_fields() {
        let response: UsageResponse = serde_json::from_value(serde_json::json!({
            "traffic_used": 11_534_336,
            "traffic_total": 1_099_511_627_776_u64,
            "traffic_remaining": 1_099_500_093_440_u64,
            "is_expired": false,
            "is_traffic_exhausted": false,
            "is_usable": true,
            "status": "active",
            "blocked_reason": null
        }))
        .unwrap();

        assert_eq!(response.traffic_used, 11_534_336);
        assert_eq!(response.traffic_total, 1_099_511_627_776);
    }
}
