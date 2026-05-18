//! Tauri 命令层 — 向后兼容模块。
//!
//! 共享类型已迁移至 [`crate::models::proxy_config`]。
//! 此模块仅保留 Tauri command handler 与向后兼容的 re-export。

pub mod builtin_config;
pub mod mihomo_constants;
pub mod mihomo_kernel;
pub mod proxy;

// 向后兼容 re-export（新代码应直接使用 models::proxy_config）
pub use crate::models::proxy_config::*;
