use flate2::write::GzEncoder;
use flate2::Compression;
use std::io::{Read, Write};
use std::path::Path;
use tauri::{AppHandle, Manager};

pub(super) fn today_date_string() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

fn compress_singbox_log(log_path: &Path) -> std::io::Result<()> {
    const MAX_LOG_SIZE: u64 = 10 * 1024 * 1024;

    if let Ok(meta) = std::fs::metadata(log_path) {
        if meta.len() > MAX_LOG_SIZE {
            let compressed_path = log_path.with_extension("log.gz");
            let mut input_file = std::fs::File::open(log_path)?;
            let compressed_file = std::fs::File::create(&compressed_path)?;
            let mut encoder = GzEncoder::new(compressed_file, Compression::default());

            let mut buffer = vec![0; 8192];
            loop {
                let n = input_file.read(&mut buffer)?;
                if n == 0 {
                    break;
                }
                encoder.write_all(&buffer[..n])?;
            }

            encoder.finish()?;
            std::fs::remove_file(log_path)?;
            log::info!(
                "Compressed aurestream-core log to: {}",
                compressed_path.display()
            );
        }
    }
    Ok(())
}

pub(crate) fn prepare_singbox_log_dir(log_dir: &Path) -> std::io::Result<std::path::PathBuf> {
    std::fs::create_dir_all(log_dir)?;

    let date = today_date_string();
    let log_path = log_dir.join(format!("aurestream-core-{}.log", date));
    let cutoff = std::time::SystemTime::now() - std::time::Duration::from_secs(3 * 86400);

    if let Ok(entries) = std::fs::read_dir(log_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            if !name_str.starts_with("aurestream-core-") {
                continue;
            }

            let is_log = name_str.ends_with(".log");
            let is_gz = name_str.ends_with(".log.gz");
            if !is_log && !is_gz {
                continue;
            }

            if let Ok(meta) = entry.metadata() {
                let modified = meta.modified().unwrap_or(std::time::SystemTime::now());
                if modified < cutoff {
                    let _ = std::fs::remove_file(entry.path());
                    log::info!("Removed aurestream-core log: {}", name_str);
                    continue;
                }
            }

            if is_log && !name_str.contains(&date) {
                let _ = compress_singbox_log(&entry.path());
            }
        }
    }

    Ok(log_path)
}

pub(crate) fn resolve_singbox_log_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    let log_dir = app.path().app_log_dir().ok()?;
    prepare_singbox_log_dir(&log_dir)
        .map_err(|e| log::warn!("[sing-box] prepare log dir failed: {}", e))
        .ok()
}

pub(super) fn create_singbox_log_writer(app: &AppHandle) -> Option<std::fs::File> {
    let log_path = resolve_singbox_log_path(app)?;
    std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|e| log::error!("Failed to open {}: {}", log_path.display(), e))
        .ok()
}

pub(super) fn write_singbox_log(writer: &mut Option<std::fs::File>, line: &str) {
    if let Some(ref mut file) = writer {
        let trimmed = line.trim_end_matches(|c| c == '\r' || c == '\n');
        let _ = writeln!(file, "{}", trimmed);
    }
}

pub fn cleanup_old_app_logs(app: &AppHandle) {
    let Ok(log_dir) = app.path().app_log_dir() else {
        return;
    };
    if !log_dir.exists() {
        return;
    }
    let cutoff = std::time::SystemTime::now() - std::time::Duration::from_secs(3 * 86400);

    let entries = match std::fs::read_dir(&log_dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let name = entry.file_name();
        let name_str = name.to_string_lossy();

        if !(name_str.starts_with("aurestream_") && name_str.ends_with(".log")) {
            continue;
        }

        if let Ok(meta) = entry.metadata() {
            let modified = meta.modified().unwrap_or(std::time::SystemTime::now());
            if modified < cutoff {
                if let Err(e) = std::fs::remove_file(entry.path()) {
                    log::warn!("Failed to remove old log {}: {}", name_str, e);
                } else {
                    log::info!("Removed old app log: {}", name_str);
                }
            }
        }
    }
}
