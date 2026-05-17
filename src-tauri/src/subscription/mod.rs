//! 两阶段订阅解析：Format → [`RawProxyNode`] → Protocol → [`Endpoint`]。
//!
//! 具体解析逻辑在后续迭代中填充；此处提供 trait 与注册表骨架。

pub mod cache;
pub mod deduplicator;
pub mod fetcher;
pub mod format;
pub mod normalizer;
pub mod protocol;
pub mod registry;

pub use cache::SubscriptionCache;
pub use deduplicator::dedup_endpoints;
pub use fetcher::fetch_subscription_bytes;
pub use normalizer::normalize_endpoint;
pub use registry::ParserRegistry;
