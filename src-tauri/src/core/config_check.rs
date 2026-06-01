//! sing-box sidecar config validation (`aurestream-core check`).

use tauri::AppHandle;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

/// Run `sing-box check -c <path>` via the aurestream-core sidecar before start.
pub async fn verify(app: &AppHandle, config_path: &str) -> Result<(), String> {
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
