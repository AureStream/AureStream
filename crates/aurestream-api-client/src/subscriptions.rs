use serde::{Deserialize, Serialize};

use crate::error::ApiError;

/// Upper bound on any response body read into memory by this module. Real
/// Worker subscription-list responses and provider subscription documents
/// (even hundreds of nodes) are at most a few hundred KB; this exists to cap
/// memory use if a compromised/misconfigured upstream (Worker or, more
/// realistically, a provider URL from `Subscription.url`) returns an
/// unbounded body.
const MAX_SUBSCRIPTION_BODY_BYTES: u64 = 8 * 1024 * 1024;

/// Read a response body into memory, enforcing `MAX_SUBSCRIPTION_BODY_BYTES`.
///
/// Checks `Content-Length` upfront as a fast reject, but does not rely on it
/// alone — a malicious or misconfigured server can omit or lie about that
/// header — so the running total is also checked while streaming chunks.
async fn read_capped_body(mut response: reqwest::Response) -> Result<Vec<u8>, ApiError> {
    if let Some(len) = response.content_length() {
        if len > MAX_SUBSCRIPTION_BODY_BYTES {
            return Err(ApiError::from_code("subscription_body_too_large", 0, None));
        }
    }

    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| ApiError::from_code("request_failed", 0, None))?
    {
        body.extend_from_slice(&chunk);
        if body.len() as u64 > MAX_SUBSCRIPTION_BODY_BYTES {
            return Err(ApiError::from_code("subscription_body_too_large", 0, None));
        }
    }
    Ok(body)
}

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

    let raw = read_capped_body(response).await?;
    let body: SubscriptionsResponse = serde_json::from_slice(&raw)
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

    let raw = read_capped_body(response).await?;
    String::from_utf8(raw).map_err(|_| ApiError::from_code("request_failed", 0, None))
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

    let raw = read_capped_body(response).await?;
    serde_json::from_slice(&raw).map_err(|_| ApiError::from_code("request_failed", 0, None))
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
