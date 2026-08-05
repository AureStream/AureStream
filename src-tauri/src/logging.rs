//! Cross-platform logging for AureStream v2.
//!
//! # File naming (all platforms)
//! | Stream | Active file | Rotated archive |
//! |--------|-------------|-----------------|
//! | App / Rust | `aurestream-app.log` | `aurestream-app_YYYY-MM-DD_HH-MM-SS.log` |
//! | Sidecar (Xray) | `aurestream-core-YYYY-MM-DD.log` | compressed / deleted after retention |
//!
//! OS log directories (via Tauri `app_log_dir`):
//! - macOS: `~/Library/Logs/com.root.aurestream/`
//! - Windows: `%LOCALAPPDATA%\com.root.aurestream\logs\`
//! - Linux: `~/.local/share/com.root.aurestream/logs/`
//!
//! # Line format (all platforms, local timezone)
//! ```text
//! 2026-08-05 21:43:23.728 INFO [engine] start ok
//! 2026-08-05 21:43:23.801 CORE [stderr] Xray 26.3.27 started
//! ```

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use log::LevelFilter;
use tauri::{AppHandle, Manager};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};

/// Active app log base name (plugin appends `.log`).
pub const APP_LOG_FILE_STEM: &str = "aurestream-app";
/// Sidecar / core log prefix: `aurestream-core-YYYY-MM-DD.log` (written by engine).
pub const CORE_LOG_PREFIX: &str = "aurestream-core";
/// Max size of the active app log before rotation (10 MiB).
const APP_LOG_MAX_BYTES: u128 = 10 * 1024 * 1024;
/// Keep core / app artifacts for this many days.
const LOG_RETENTION_DAYS: u64 = 7;

/// Build the Tauri log plugin with unified naming + format for every desktop OS.
pub fn plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri_plugin_log::Builder::new()
        .level(LevelFilter::Info)
        .level_for("tao", LevelFilter::Warn)
        .level_for("wry", LevelFilter::Warn)
        .level_for("hyper", LevelFilter::Warn)
        .level_for("reqwest", LevelFilter::Warn)
        .level_for("rustls", LevelFilter::Warn)
        .timezone_strategy(TimezoneStrategy::UseLocal)
        .max_file_size(APP_LOG_MAX_BYTES)
        .rotation_strategy(RotationStrategy::KeepAll)
        .format(|out, message, record| {
            out.finish(format_args!(
                "{} {} [{}] {}",
                format_timestamp_local(),
                record.level(),
                short_target(record.target()),
                message
            ))
        })
        .targets([
            Target::new(TargetKind::Stdout),
            Target::new(TargetKind::LogDir {
                file_name: Some(APP_LOG_FILE_STEM.into()),
            }),
        ])
        .build()
}

/// `YYYY-MM-DD HH:MM:SS.mmm` in local time — identical shape on Win/macOS/Linux.
pub fn format_timestamp_local() -> String {
    let now = chrono::Local::now();
    format!(
        "{}.{:03}",
        now.format("%Y-%m-%d %H:%M:%S"),
        now.timestamp_subsec_millis()
    )
}

/// Collapse `aurestream_lib::commands::engine` → `engine` for shorter lines.
fn short_target(target: &str) -> &str {
    target
        .rsplit("::")
        .next()
        .filter(|s| !s.is_empty())
        .unwrap_or(target)
}

/// Resolve OS log directory (creates it if needed).
pub fn app_log_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_log_dir()
        .map_err(|e| format!("app_log_dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("create log dir {}: {e}", dir.display()))?;
    Ok(dir)
}

/// Drop `aurestream-app*` / `aurestream-core-*` files older than retention.
pub fn prune_old_logs(log_dir: &Path) {
    let Ok(entries) = fs::read_dir(log_dir) else {
        return;
    };
    let cutoff = SystemTime::now() - Duration::from_secs(LOG_RETENTION_DAYS * 86400);
    for entry in entries.flatten() {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        let keep = name.starts_with(APP_LOG_FILE_STEM)
            || name.starts_with(CORE_LOG_PREFIX)
            // Legacy product-name log from older builds.
            || name.eq_ignore_ascii_case("AureStream.log")
            || name.starts_with("AureStream_");
        if !keep {
            continue;
        }
        let Ok(meta) = entry.metadata() else {
            continue;
        };
        let modified = meta.modified().unwrap_or(SystemTime::now());
        if modified < cutoff {
            let _ = fs::remove_file(entry.path());
        }
    }
}

/// Best-effort prune on a background thread so setup stays fast.
pub fn spawn_log_maintenance(app: &AppHandle) {
    let Ok(dir) = app_log_dir(app) else {
        return;
    };
    std::thread::Builder::new()
        .name("aurestream-log-prune".into())
        .spawn(move || {
            prune_old_logs(&dir);
        })
        .ok();
}
