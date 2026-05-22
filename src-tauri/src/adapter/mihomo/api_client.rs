//! HTTP 客户端：访问 Mihomo External Controller（9090）。
//!
//! 注意：请求必须 `no_proxy`，避免系统代理环回。

use reqwest::Url;
use serde_json::json;

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

    /// PATCH /proxies/{group_name} — 切换代理组选中的节点。
    pub async fn switch_node(&self, group_name: &str, proxy_name: &str) -> Result<(), AppError> {
        let url = self.url(&format!("proxies/{group_name}"))?;
        self.client
            .patch(url)
            .json(&json!({ "name": proxy_name }))
            .send()
            .await
            .map_err(AppError::Http)?
            .error_for_status()
            .map_err(|e| AppError::CoreApiError(e.to_string()))?;
        Ok(())
    }

    /// GET /proxies/{proxy_name}/delay — 测试单节点延迟。
    pub async fn test_node_delay(
        &self,
        proxy_name: &str,
        test_url: &str,
        timeout_ms: u64,
    ) -> Result<u32, AppError> {
        let url = self.url(&format!("proxies/{proxy_name}/delay"))?;
        let resp: serde_json::Value = self
            .client
            .get(url)
            .query(&[("url", test_url), ("timeout", &timeout_ms.to_string())])
            .send()
            .await
            .map_err(AppError::Http)?
            .error_for_status()
            .map_err(|e| AppError::CoreApiError(e.to_string()))?
            .json()
            .await
            .map_err(AppError::Http)?;

        resp.get("delay")
            .and_then(|d| d.as_u64())
            .map(|d| d as u32)
            .ok_or_else(|| AppError::CoreApiError("延迟测试响应缺少 delay 字段".into()))
    }

    /// PATCH /configs — 切换模式（rule/global/direct）。
    pub async fn set_mode(&self, mode: &str) -> Result<(), AppError> {
        let url = self.url("configs")?;
        self.client
            .patch(url)
            .json(&json!({ "mode": mode }))
            .send()
            .await
            .map_err(AppError::Http)?
            .error_for_status()
            .map_err(|e| AppError::CoreApiError(e.to_string()))?;
        Ok(())
    }
}
