//! 三层缓存策略：fetch → Layer1 → 解析 → Layer2 → Endpoint → Layer3。
//!
//! - Layer 1 (`last_success_raw`): HTTP 原始响应 BLOB（gzip 压缩）
//! - Layer 2 (`parsed_cache`): RawProxyNode[] JSON 序列化
//! - Layer 3 (`endpoints` 表): 最终 Endpoint 记录
//!
//! 失败恢复：
//! - fetch 失败 → 保留 Layer 3 现有数据，不清空
//! - parse 失败 → 尝试从 Layer 1 重新解析
//! - DB 为空   → 尝试从 Layer 2 恢复

use sqlx::SqlitePool;

use crate::error::AppError;
use crate::models::{Endpoint, RawProxyNode};
use crate::storage::{endpoint_repo, subscription_repo};

use super::registry::ParserRegistry;

pub struct SubscriptionCache {
    pool: SqlitePool,
    registry: ParserRegistry,
}

impl SubscriptionCache {
    pub fn new(pool: SqlitePool, registry: ParserRegistry) -> Self {
        Self { pool, registry }
    }

    /// 完整的订阅更新流水线：fetch → 解析 → 写入三层缓存。
    ///
    /// 返回成功解析的 Endpoint 列表。失败时保留现有数据。
    pub async fn ingest(
        &self,
        source_id: &str,
        raw_bytes: &[u8],
    ) -> Result<Vec<Endpoint>, AppError> {
        // Layer 1: 保存 HTTP 原始响应
        subscription_repo::save_raw_cache(&self.pool, source_id, raw_bytes).await?;

        // 两阶段解析
        let endpoints = self.registry.ingest_subscription_bytes(raw_bytes, source_id);

        if endpoints.is_empty() {
            tracing::warn!(source_id = %source_id, "解析结果为空，尝试从缓存恢复");
            return self.try_recover_from_cache(source_id).await;
        }

        // Layer 2: 保存 RawProxyNode[] JSON（用于未来从 Layer 2 恢复）
        // 通过重新 parse_raw_nodes 获取 RawProxyNode 序列化
        if let Ok(raw_nodes) = self.registry.parse_raw_nodes(raw_bytes, source_id) {
            if let Ok(json) = serde_json::to_string(&raw_nodes) {
                let _ = subscription_repo::save_parsed_cache(&self.pool, source_id, &json).await;
            }
        }

        // Layer 3: 写入 endpoints 表
        endpoint_repo::replace_for_source(&self.pool, source_id, &endpoints).await?;

        // 更新订阅健康状态
        subscription_repo::update_health(
            &self.pool,
            source_id,
            endpoints.len() as i32,
            crate::models::subscription::HealthStatus::Ok,
            None,
        )
        .await?;

        tracing::info!(source_id = %source_id, count = endpoints.len(), "订阅更新成功");
        Ok(endpoints)
    }

    /// 从 Layer 1 (raw) 重新解析并恢复 Layer 2/3。
    pub async fn try_recover_from_raw(&self, source_id: &str) -> Result<Vec<Endpoint>, AppError> {
        let Some(raw_bytes) = subscription_repo::load_raw_cache(&self.pool, source_id).await? else {
            tracing::warn!(source_id = %source_id, "Layer 1 缓存为空，无法恢复");
            return Ok(Vec::new());
        };

        tracing::info!(source_id = %source_id, "从 Layer 1 原始数据恢复解析");
        let endpoints = self.registry.ingest_subscription_bytes(&raw_bytes, source_id);

        if endpoints.is_empty() {
            return Err(AppError::other("从 Layer 1 恢复后仍无有效节点"));
        }

        // 更新 Layer 2
        if let Ok(raw_nodes) = self.registry.parse_raw_nodes(&raw_bytes, source_id) {
            if let Ok(json) = serde_json::to_string(&raw_nodes) {
                let _ = subscription_repo::save_parsed_cache(&self.pool, source_id, &json).await;
            }
        }

        // 更新 Layer 3
        endpoint_repo::replace_for_source(&self.pool, source_id, &endpoints).await?;
        subscription_repo::update_health(
            &self.pool,
            source_id,
            endpoints.len() as i32,
            crate::models::subscription::HealthStatus::Ok,
            Some("从缓存恢复"),
        )
        .await?;

        Ok(endpoints)
    }

    /// 从 Layer 2 (parsed_cache) 恢复 Endpoint 列表。
    pub async fn try_recover_from_parsed(&self, source_id: &str) -> Result<Vec<Endpoint>, AppError> {
        let Some(json) = subscription_repo::load_parsed_cache(&self.pool, source_id).await? else {
            tracing::warn!(source_id = %source_id, "Layer 2 缓存为空，无法恢复");
            return Ok(Vec::new());
        };

        let raw_nodes: Vec<RawProxyNode> = serde_json::from_str(&json)
            .map_err(|e| AppError::other(format!("Layer 2 反序列化失败: {e}")))?;

        tracing::info!(source_id = %source_id, count = raw_nodes.len(), "从 Layer 2 缓存恢复");

        let mut endpoints = Vec::with_capacity(raw_nodes.len());
        for raw in &raw_nodes {
            match self.registry.raw_to_endpoint(raw, source_id) {
                Ok(mut ep) => {
                    super::normalizer::normalize_endpoint(&mut ep);
                    endpoints.push(ep);
                }
                Err(e) => tracing::warn!(error = %e, "Layer 2 恢复时跳过节点"),
            }
        }

        endpoints = super::deduplicator::dedup_endpoints(endpoints);

        if !endpoints.is_empty() {
            endpoint_repo::replace_for_source(&self.pool, source_id, &endpoints).await?;
        }

        Ok(endpoints)
    }

    /// 按优先级尝试恢复：Layer 3 → Layer 2 → Layer 1。
    async fn try_recover_from_cache(&self, source_id: &str) -> Result<Vec<Endpoint>, AppError> {
        // Layer 3: 直接查 endpoints 表
        let existing = endpoint_repo::list_by_source(&self.pool, source_id).await?;
        if !existing.is_empty() {
            tracing::info!(source_id = %source_id, count = existing.len(), "Layer 3 仍有数据，保留");
            return Ok(existing);
        }

        // Layer 2: parsed_cache
        if let Ok(eps) = self.try_recover_from_parsed(source_id).await {
            if !eps.is_empty() {
                return Ok(eps);
            }
        }

        // Layer 1: raw
        if let Ok(eps) = self.try_recover_from_raw(source_id).await {
            if !eps.is_empty() {
                return Ok(eps);
            }
        }

        tracing::warn!(source_id = %source_id, "三层缓存均无数据");
        Ok(Vec::new())
    }
}
