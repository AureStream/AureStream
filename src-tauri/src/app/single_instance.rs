#[cfg(windows)]
mod imp {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{GetLastError, ERROR_ALREADY_EXISTS};
    use windows::Win32::System::Threading::CreateMutexW;
    use windows::Win32::UI::WindowsAndMessaging::{
        FindWindowW, IsIconic, SetForegroundWindow, ShowWindow, SW_RESTORE, SW_SHOW,
    };

    pub fn ensure_single_instance() {
        let mutex_name: Vec<u16> = "AureStream_SingleInstance\0".encode_utf16().collect();

        unsafe {
            let _ = CreateMutexW(None, true, PCWSTR::from_raw(mutex_name.as_ptr()));
            if GetLastError() == ERROR_ALREADY_EXISTS {
                let title: Vec<u16> = "AureStream\0".encode_utf16().collect();
                if let Ok(hwnd) = FindWindowW(PCWSTR::null(), PCWSTR::from_raw(title.as_ptr())) {
                    if IsIconic(hwnd).as_bool() {
                        let _ = ShowWindow(hwnd, SW_RESTORE);
                    }
                    let _ = ShowWindow(hwnd, SW_SHOW);
                    let _ = SetForegroundWindow(hwnd);
                }
                std::process::exit(0);
            }
            // Mutex is automatically released when the process exits
        }
    }

    #[allow(dead_code)]
    pub fn cleanup() {
        // Windows mutex is released by the OS on process exit
    }
}

#[cfg(not(windows))]
mod imp {
    use std::fs;
    use std::io::Write;
    use std::path::PathBuf;

    fn lock_path() -> PathBuf {
        std::env::temp_dir().join("aurestream-single-instance.lock")
    }

    fn pid_alive(pid: u32) -> bool {
        #[cfg(unix)]
        unsafe {
            libc::kill(pid as i32, 0) == 0
        }
        #[cfg(not(unix))]
        {
            let _ = pid;
            false
        }
    }

    pub fn ensure_single_instance() {
        let path = lock_path();

        // Use O_CREAT|O_EXCL via create_new(true) for atomic lock acquisition.
        // This eliminates the TOCTOU race between checking existence and creating.
        let pid = std::process::id();
        match std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
        {
            Ok(mut f) => {
                let _ = write!(f, "{}", pid);
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                // Lock file exists — check if the owning process is alive
                if let Ok(content) = fs::read_to_string(&path) {
                    if let Ok(old_pid) = content.trim().parse::<u32>() {
                        if pid_alive(old_pid) {
                            log::info!(
                                "[single_instance] another instance is running (pid {}), exiting",
                                old_pid
                            );
                            std::process::exit(0);
                        }
                        log::info!(
                            "[single_instance] stale lock file found (pid {} dead), removing",
                            old_pid
                        );
                    } else {
                        log::info!("[single_instance] corrupt lock file, removing");
                    }
                }
                let _ = fs::remove_file(&path);
                // Retry: the stale file is gone, try atomic create again
                match std::fs::OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(&path)
                {
                    Ok(mut f) => {
                        let _ = write!(f, "{}", pid);
                    }
                    Err(e) => {
                        log::error!(
                            "[single_instance] failed to acquire lock on retry: {}",
                            e
                        );
                    }
                }
            }
            Err(e) => {
                log::error!(
                    "[single_instance] failed to create lock file: {}, falling through",
                    e
                );
            }
        }
    }

    pub fn cleanup() {
        let path = lock_path();
        // Only remove if our PID matches — avoid removing another instance's lock
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(pid) = content.trim().parse::<u32>() {
                if pid == std::process::id() {
                    let _ = fs::remove_file(&path);
                }
            }
        }
    }
}

pub fn ensure_single_instance() {
    imp::ensure_single_instance();
}

/// Clean up the single-instance guard on graceful exit.
pub fn cleanup() {
    imp::cleanup();
}
