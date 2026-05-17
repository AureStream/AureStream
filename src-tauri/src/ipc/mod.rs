//! IPC 薄层占位。
//!
//! 后续在此聚合 `#[tauri::command]`，替换零散 `commands/*`，并与 [`crate::runtime::RuntimeManager`]、[`crate::storage`] 对齐。
//!
//! 规划：`connection_commands` · `subscription_commands` · `node_commands` · `settings_commands` · `tray_commands`。
