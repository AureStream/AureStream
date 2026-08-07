//! Windows SCM service binary + elevated install/uninstall entry.
//!
//! Built as `tun-service.exe` and shipped via Tauri `externalBin`.

// GUI / service binary — do not allocate a console window on start/install.
#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

#[cfg(target_os = "windows")]
fn main() {
    let args: Vec<String> = std::env::args().collect();
    match args.get(1).map(|s| s.as_str()) {
        Some("install") => {
            let bundled = args.get(2).cloned().unwrap_or_else(|| {
                std::env::current_exe()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .into_owned()
            });
            match aurestream_platform_tun::windows_scm_ensure_installed(std::path::Path::new(
                &bundled,
            )) {
                Ok(()) => std::process::exit(0),
                Err(e) => {
                    // Do NOT use eprintln! — it triggers console window flash on windows_subsystem="windows"
                    // Exit with non-zero code; parent (elevate.rs) will surface the error
                    let _ = std::fs::write(
                        std::env::temp_dir().join("aurestream-tun-install-error.log"),
                        format!("install failed: {e}\n"),
                    );
                    std::process::exit(1);
                }
            }
        }
        Some("uninstall") => match aurestream_platform_tun::windows_scm_uninstall() {
            Ok(()) => std::process::exit(0),
            Err(e) => {
                // Do NOT use eprintln! — it triggers console window flash
                let _ = std::fs::write(
                    std::env::temp_dir().join("aurestream-tun-uninstall-error.log"),
                    format!("uninstall failed: {e}\n"),
                );
                std::process::exit(1);
            }
        },
        Some("orphan-check") => {
            // Exit 0 always: task scheduler should not flap on "app still present".
            let _cleaned = aurestream_platform_tun::windows_orphan_check();
            std::process::exit(0);
        }
        _ => {
            let code = aurestream_platform_tun::windows_service_run_dispatcher();
            std::process::exit(code);
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn main() {
    eprintln!("tun-service is Windows-only");
    std::process::exit(1);
}
