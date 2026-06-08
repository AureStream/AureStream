use serde::Serialize;
use std::process::Command;
use std::time::{Duration, Instant};

#[cfg(target_os = "macos")]
pub mod macos;
#[cfg(target_os = "linux")]
pub mod linux;

const DEFAULT_MIXED_PROXY_PORT: u16 = 2345;

#[derive(Serialize)]
pub struct PrestartCheckResult {
    pub port_occupied: bool,
    pub orphan_pids: Vec<u32>,
}

#[derive(Serialize)]
pub struct KillOrphansResult {
    pub success: bool,
    pub killed_pids: Vec<u32>,
    pub port_released: bool,
    pub message: String,
}

fn find_pids_on_port(port: u16) -> Vec<u32> {
    #[cfg(target_os = "windows")]
    {
        find_pids_windows(port)
    }
    #[cfg(target_os = "macos")]
    {
        find_pids_macos(port)
    }
    #[cfg(target_os = "linux")]
    {
        find_pids_linux(port)
    }
}

#[cfg(target_os = "windows")]
fn find_pids_windows(port: u16) -> Vec<u32> {
    let output = Command::new("netstat")
        .args(["-ano"])
        .output()
        .unwrap_or_else(|_| std::process::Output {
            status: std::process::ExitStatus::default(),
            stdout: vec![],
            stderr: vec![],
        });

    let text = String::from_utf8_lossy(&output.stdout);
    let mut pids = Vec::new();
    let needle = format!(":{port}");

    for line in text.lines() {
        if !line.contains(&needle) {
            continue;
        }
        if !line.to_uppercase().contains("LISTENING") {
            continue;
        }
        let parts: Vec<&str> = line.split_whitespace().collect();
        if let Some(pid_str) = parts.last() {
            if let Ok(pid) = pid_str.parse::<u32>() {
                if pid != 0 && !pids.contains(&pid) {
                    pids.push(pid);
                }
            }
        }
    }
    pids
}

#[cfg(target_os = "macos")]
fn find_pids_macos(port: u16) -> Vec<u32> {
    let port_arg = format!("TCP:{port}");
    let output = Command::new("lsof")
        .args(["-ti", &port_arg, "-sTCP:LISTEN"])
        .output();

    match output {
        Ok(out) => {
            let text = String::from_utf8_lossy(&out.stdout);
            text.lines()
                .filter_map(|l| l.trim().parse::<u32>().ok())
                .collect()
        }
        Err(_) => vec![],
    }
}

#[cfg(target_os = "linux")]
fn find_pids_linux(port: u16) -> Vec<u32> {
    let port_arg = format!("{port}/tcp");
    let output = Command::new("fuser").arg(port_arg).output();

    match output {
        Ok(out) => {
            let text = String::from_utf8_lossy(&out.stdout);
            let stderr_text = String::from_utf8_lossy(&out.stderr);
            let combined = format!("{}{}", text, stderr_text);
            combined
                .split_whitespace()
                .filter_map(|s| s.parse::<u32>().ok())
                .collect()
        }
        Err(_) => vec![],
    }
}

fn kill_pid(pid: u32) -> bool {
    #[cfg(target_os = "windows")]
    {
        Command::new("taskkill")
            .args(["/F", "/PID", &pid.to_string()])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
    #[cfg(unix)]
    {
        let ret = unsafe { libc::kill(pid as i32, libc::SIGKILL) };
        ret == 0
    }
}

fn probe_port_listening(port: u16) -> bool {
    use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpStream};

    let addr = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port);
    TcpStream::connect_timeout(&addr, Duration::from_millis(100)).is_ok()
}

pub fn prestart_check(port: Option<u16>) -> PrestartCheckResult {
    let port = port.unwrap_or(DEFAULT_MIXED_PROXY_PORT);
    let port_occupied = probe_port_listening(port);
    let orphan_pids = if port_occupied {
        find_pids_on_port(port)
    } else {
        vec![]
    };
    log::info!(
        "[prestart] check: port={} port_occupied={} orphan_pids={:?}",
        port,
        port_occupied,
        orphan_pids
    );
    PrestartCheckResult {
        port_occupied,
        orphan_pids,
    }
}

pub fn kill_orphans(_app: tauri::AppHandle, port: Option<u16>) -> KillOrphansResult {
    let port = port.unwrap_or(DEFAULT_MIXED_PROXY_PORT);
    let check = prestart_check(Some(port));

    if !check.port_occupied || check.orphan_pids.is_empty() {
        return KillOrphansResult {
            success: true,
            killed_pids: vec![],
            port_released: true,
            message: String::from("no orphans found"),
        };
    }

    let mut killed_pids = Vec::new();
    for pid in &check.orphan_pids {
        if kill_pid(*pid) {
            killed_pids.push(*pid);
        }
    }

    let deadline = Instant::now() + Duration::from_secs(3);
    let port_released = loop {
        if !probe_port_listening(port) {
            break true;
        }
        if Instant::now() >= deadline {
            break false;
        }
        std::thread::sleep(Duration::from_millis(200));
    };

    let message = if port_released {
        format!("killed {:?}, port released", killed_pids)
    } else {
        format!("killed {:?}, port still occupied", killed_pids)
    };

    log::info!(
        "[prestart] kill_orphans: killed={:?} port_released={}",
        killed_pids,
        port_released
    );

    KillOrphansResult {
        success: port_released,
        killed_pids,
        port_released,
        message,
    }
}

#[cfg(target_os = "windows")]
pub fn run_elevated_install(bundled_exe: &std::path::Path) -> Result<(), String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    use windows::Win32::Foundation::{CloseHandle, WAIT_OBJECT_0};
    use windows::Win32::System::Threading::{
        GetExitCodeProcess, WaitForSingleObject, INFINITE,
    };
    use windows::Win32::UI::Shell::{ShellExecuteExW, SHELLEXECUTEINFOW, SEE_MASK_NOCLOSEPROCESS};

    if !bundled_exe.exists() {
        return Err(format!(
            "bundled service exe does not exist: {}",
            bundled_exe.display()
        ));
    }

    let verb: Vec<u16> = OsStr::new("runas\0").encode_wide().collect();
    let file: Vec<u16> = bundled_exe.as_os_str().encode_wide().chain(Some(0)).collect();
    let params_str = format!("install \"{}\"", bundled_exe.display());
    let params: Vec<u16> = OsStr::new(&params_str).encode_wide().chain(Some(0)).collect();

    let mut sei = SHELLEXECUTEINFOW {
        cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
        fMask: SEE_MASK_NOCLOSEPROCESS,
        lpVerb: windows::core::PCWSTR(verb.as_ptr()),
        lpFile: windows::core::PCWSTR(file.as_ptr()),
        lpParameters: windows::core::PCWSTR(params.as_ptr()),
        nShow: 0,
        ..Default::default()
    };

    let ok = unsafe { ShellExecuteExW(&mut sei) };
    if !ok.is_ok() {
        return Err(
            "UAC elevation was cancelled or failed. The TUN service requires a one-time \
             Administrator approval to install. Please try again and accept the UAC prompt."
                .into(),
        );
    }

    let process = sei.hProcess;
    if process.is_invalid() {
        return Err("ShellExecuteExW succeeded but returned invalid process handle".into());
    }

    let wait_result = unsafe { WaitForSingleObject(process, INFINITE) };
    if wait_result != WAIT_OBJECT_0 {
        unsafe {
            let _ = CloseHandle(process);
        }
        return Err(format!(
            "WaitForSingleObject returned unexpected value: {:?}",
            wait_result
        ));
    }

    let mut exit_code: u32 = 1;
    let _ = unsafe { GetExitCodeProcess(process, &mut exit_code) };
    unsafe {
        let _ = CloseHandle(process);
    }

    if exit_code != 0 {
        return Err(format!(
            "Elevated tun-service install failed with exit code {}",
            exit_code
        ));
    }

    log::info!("[win] elevated tun-service install completed successfully");
    Ok(())
}

#[cfg(target_os = "windows")]
pub fn run_elevated_uninstall(bundled_exe: &std::path::Path) -> Result<(), String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    use windows::Win32::Foundation::{CloseHandle, WAIT_OBJECT_0};
    use windows::Win32::System::Threading::{
        GetExitCodeProcess, WaitForSingleObject, INFINITE,
    };
    use windows::Win32::UI::Shell::{ShellExecuteExW, SHELLEXECUTEINFOW, SEE_MASK_NOCLOSEPROCESS};

    if !bundled_exe.exists() {
        return Err(format!(
            "bundled service exe does not exist: {}",
            bundled_exe.display()
        ));
    }

    let verb: Vec<u16> = OsStr::new("runas\0").encode_wide().collect();
    let file: Vec<u16> = bundled_exe.as_os_str().encode_wide().chain(Some(0)).collect();
    let params: Vec<u16> = OsStr::new("uninstall").encode_wide().chain(Some(0)).collect();

    let mut sei = SHELLEXECUTEINFOW {
        cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
        fMask: SEE_MASK_NOCLOSEPROCESS,
        lpVerb: windows::core::PCWSTR(verb.as_ptr()),
        lpFile: windows::core::PCWSTR(file.as_ptr()),
        lpParameters: windows::core::PCWSTR(params.as_ptr()),
        nShow: 0,
        ..Default::default()
    };

    let ok = unsafe { ShellExecuteExW(&mut sei) };
    if !ok.is_ok() {
        return Err(
            "UAC elevation was cancelled or failed. The TUN service requires Administrator \
             approval to uninstall. Please try again and accept the UAC prompt."
                .into(),
        );
    }

    let process = sei.hProcess;
    if process.is_invalid() {
        return Err("ShellExecuteExW succeeded but returned invalid process handle".into());
    }

    let wait_result = unsafe { WaitForSingleObject(process, INFINITE) };
    if wait_result != WAIT_OBJECT_0 {
        unsafe {
            let _ = CloseHandle(process);
        }
        return Err(format!(
            "WaitForSingleObject returned unexpected value: {:?}",
            wait_result
        ));
    }

    let mut exit_code: u32 = 1;
    let _ = unsafe { GetExitCodeProcess(process, &mut exit_code) };
    unsafe {
        let _ = CloseHandle(process);
    }

    if exit_code != 0 {
        return Err(format!(
            "Elevated tun-service uninstall failed with exit code {}",
            exit_code
        ));
    }

    log::info!("[win] elevated tun-service uninstall completed successfully");
    Ok(())
}

#[cfg(target_os = "linux")]
pub fn reload_via_pkexec(helper_path: &str) -> Result<(), String> {
    let output = Command::new("pkexec")
        .args([helper_path, "reload"])
        .output()
        .map_err(|e| format!("pkexec reload failed: {}", e))?;
    if !output.status.success() {
        return Err(format!(
            "helper reload non-zero: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    log::info!("[reload] SIGHUP + flush-caches via helper");
    Ok(())
}
