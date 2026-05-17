//! HTTP 客户端：访问 Mihomo External Controller（9090）。
//!
//! 注意：请求必须 `no_proxy`，避免系统代理环回。

use reqwest::Url;

use crate::error::AppError;
use crate::models::TrafficStats;

pub struct MihomoApiClient {
    base: String,
    client: reqwest::Client,
}

impl MihomoApiClient {
    pub fn new(base: impl Into<String>) -> Result<Self, AppError> {
        let client = reqwest::Client::builder()
            .no_proxy()
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .map_err(AppError::Http)?;
        Ok(Self {
            base: base.into(),
            client,
        })
    }

    fn url(&self, path: &str) -> Result<Url, AppError> {
        let base = self.base.trim_end_matches('/');
        let path = path.trim_start_matches('/');
        Url::parse(&format!("{base}/{path}")).map_err(|e| AppError::other(format!("非法 URL: {e}")))
    }

    pub async fn version(&self) -> Result<String, AppError> {
        let url = self.url("version")?;
        let text = self
            .client
            .get(url)
            .send()
            .await
            .map_err(AppError::Http)?
            .error_for_status()
            .map_err(|e| AppError::CoreApiError(e.to_string()))?
            .text()
            .await
            .map_err(AppError::Http)?;
        Ok(text)
    }

    /// GET /traffic — 响应字段依 Mihomo 版本略有差异，此处做宽松解析。
    pub async fn traffic_stats(&self) -> Result<TrafficStats, AppError> {
        let url = self.url("traffic")?;
        let v: serde_json::Value = self
            .client
            .get(url)
            .send()
            .await
            .map_err(AppError::Http)?
            .error_for_status()
            .map_err(|e| AppError::CoreApiError(e.to_string()))?
            .json()
            .await
            .map_err(AppError::Http)?;

        let up = v
            .get("up")
            .and_then(|x| x.as_u64())
            .or_else(|| v.get("upload").and_then(|x| x.as_u64()))
            .unwrap_or(0);
        let down = v
            .get("down")
            .and_then(|x| x.as_u64())
            .or_else(|| v.get("download").and_then(|x| x.as_u64()))
            .unwrap_or(0);

        Ok(TrafficStats {
            upload_total: up,
            download_total: down,
        })
    }
}
