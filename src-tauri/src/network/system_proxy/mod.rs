//! 系统代理入口文档化占位。
//!
//! 实际逻辑仍在 [`crate::commands::system_proxy`]；迁移时在对应平台的 `macos.rs` / `windows.rs` 中拆分。

pub use crate::commands::ProxyConfig;
pub use crate::commands::DEFAULT_PROXY_BYPASS_DOMAINS;

use crate::error::AppError;

pub fn apply(config: &ProxyConfig) -> Result<(), AppError> {
    crate::commands::system_proxy::apply_platform(config).map_err(AppError::other)
}

pub fn clear() -> Result<(), AppError> {
    crate::commands::system_proxy::clear_platform().map_err(AppError::other)
}
