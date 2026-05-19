//! IPC 命令层：Tauri `#[tauri::command]` 函数。
//!
//! 每个子模块对应前端的一类操作。命令函数是薄包装，核心逻辑在 [`crate::runtime::RuntimeManager`] 和 [`crate::storage`] 中。

pub mod connection;
pub mod network_info;
pub mod node;
pub mod settings;
pub mod subscription;
pub mod tray;
