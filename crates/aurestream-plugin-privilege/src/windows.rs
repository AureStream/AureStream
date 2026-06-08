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
