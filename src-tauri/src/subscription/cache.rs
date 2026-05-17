//! 三层缓存策略的类型别名与说明占位。
//!
//! Layer1 `last_success_raw` / Layer2 `parsed_cache` / Layer3 `endpoints` 表字段已在 migration 中定义；
//! 完整流水线在接线 `storage::subscription_repo` 与解析完成后填充。

/// 预留：封装「fetch → 写 Layer1 → 解析 → 写 Layer2/3」的事务边界。
pub struct SubscriptionCache;

impl SubscriptionCache {
    pub const fn new() -> Self {
        Self
    }
}
