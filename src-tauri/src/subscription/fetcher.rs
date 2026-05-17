//! HTTP 拉取订阅正文（不含数据库缓存；缓存见 [`super::cache`]）。

use crate::error::AppError;

pub async fn fetch_subscription_bytes(url: &str) -> Result<Vec<u8>, AppError> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(AppError::Http)?;
    let resp = client.get(url).send().await.map_err(AppError::Http)?;
    if !resp.status().is_success() {
        return Err(AppError::other(format!(
            "订阅 HTTP {} {}",
            resp.status().as_u16(),
            resp.status().canonical_reason().unwrap_or("")
        )));
    }
    Ok(resp.bytes().await.map_err(AppError::Http)?.to_vec())
}
