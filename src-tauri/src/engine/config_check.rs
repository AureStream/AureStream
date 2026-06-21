//! sing-box sidecar config validation (`aurestream-core check`).

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::UNIX_EPOCH;

use tauri::AppHandle;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

type FileStamp = (u64, u64);

fn verified_cache() -> &'static Mutex<HashMap<String, FileStamp>> {
    static CACHE: OnceLock<Mutex<HashMap<String, FileStamp>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn file_stamp(path: &str) -> Option<FileStamp> {
    let meta = std::fs::metadata(path).ok()?;
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    Some((mtime, meta.len()))
}

/// Returns true when config file changed since the last successful verify.
pub fn needs_verify(config_path: &str) -> bool {
    let Some(stamp) = file_stamp(config_path) else {
        return true;
    };
    let guard = verified_cache().lock().unwrap_or_else(|e| e.into_inner());
    guard.get(config_path) != Some(&stamp)
}

fn mark_verified(config_path: &str) {
    let Some(stamp) = file_stamp(config_path) else {
        return;
    };
    let mut guard = verified_cache().lock().unwrap_or_else(|e| e.into_inner());
    guard.insert(config_path.to_string(), stamp);
}

/// Clear the verified-config cache so the next `needs_verify` returns `true`.
/// Called when switching proxy modes to force re-validation of `config.json`.
pub fn invalidate_cache() {
    let mut guard = verified_cache().lock().unwrap_or_else(|e| e.into_inner());
    guard.clear();
    log::debug!("[config_check] cache invalidated");
}

/// Mark config as valid without spawning `aurestream-core check`.
/// Called after the frontend merger writes `config.json` (trusted path).
#[tauri::command]
pub fn mark_config_verified(config_path: String) -> Result<(), String> {
    if !std::path::Path::new(&config_path).is_file() {
        return Err(format!("config file not found: {}", config_path));
    }
    mark_verified(&config_path);
    log::debug!("[config_check] marked verified: {}", config_path);
    Ok(())
}

/// Run `sing-box check -c <path>` via the aurestream-core sidecar before start.
pub async fn verify(app: &AppHandle, config_path: &str) -> Result<(), String> {
    let path = config_path.to_string();
    let result = verify_inner(app, config_path).await;
    if result.is_ok() {
        mark_verified(&path);
    }
    result
}

async fn verify_inner(app: &AppHandle, config_path: &str) -> Result<(), String> {
    let (mut rx, _child) = app
        .shell()
        .sidecar("aurestream-core")
        .map_err(|e| format!("sidecar lookup failed: {}", e))?
        .args(["check", "-c", config_path, "--disable-color"])
        .spawn()
        .map_err(|e| format!("config check spawn failed: {}", e))?;

    let mut stderr = String::new();
    let mut exit_code: Option<i32> = None;

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stderr(line) => {
                stderr.push_str(&String::from_utf8_lossy(&line));
            }
            CommandEvent::Terminated(payload) => {
                exit_code = payload.code;
            }
            _ => {}
        }
    }

    match exit_code {
        Some(0) => Ok(()),
        Some(code) => Err(if stderr.trim().is_empty() {
            format!("sing-box check exited with code {}", code)
        } else {
            stderr.trim().to_string()
        }),
        None => Err(if stderr.trim().is_empty() {
            "sing-box check terminated without exit code".into()
        } else {
            stderr.trim().to_string()
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn needs_verify_without_stamp_is_true() {
        assert!(needs_verify("/nonexistent/config.json"));
    }
}
