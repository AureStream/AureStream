//! ServiceMain dispatcher for the OneBox TUN service.
//!
//! SCM invokes `service_main` with argv that includes the service arguments
//! passed by `StartServiceW` in the client. We parse:
//!   argv[0] = service name (ignored)
//!   argv[1] = core config path
//!   argv[2] = OS DNS hijack IP from tun.settings.dns[0] (e.g. 1.1.1.1),
//!             or "-" to skip DNS override. Not the TUN gateway address.
//!   argv[3] = PID of the AureStream app process that owns this TUN session.
//! The core executable is never accepted through SCM arguments. It is staged
//! under ProgramData during the elevated install and resolved from there.
//!
//! Startup order (important for network availability):
//!   1. Spawn core (creates Wintun + routes; port-53 → dns-out ready)
//!   2. Wait until the Xray API port is accepting connections
//!   3. Only then rewrite physical-NIC DNS to tun.settings.dns[0] and flush
//!   4. Report SERVICE_RUNNING
//!
//! Applying DNS *before* core is ready blackholes name resolution for the
//! whole machine (NameServer forced to e.g. 1.1.1.1 with nothing answering
//! via port-53 → dns-out yet).
//! On stop/exit: kill child, remove DNS override, report SERVICE_STOPPED.

#![cfg(target_os = "windows")]
#![allow(dead_code)]

use std::ffi::OsStr;
use std::io::{BufRead, BufReader};
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpStream};
use std::os::windows::ffi::OsStrExt;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Stdio};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::time::{Duration, Instant};

/// `CREATE_NO_WINDOW` — passed via `CommandExt::creation_flags` to stop Windows
/// from allocating a visible console for console-subsystem children (core).
/// Without this flag a service (which itself has no console) spawning a console
/// program causes Windows to pop a fresh console window on the user's desktop.
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Default Xray API listen port when config parsing fails (matches app default).
const DEFAULT_API_PORT: u16 = 10809;

/// How long to wait for core's API after spawn before failing the service start.
const CORE_READY_TIMEOUT: Duration = Duration::from_secs(15);

use windows::core::{PCWSTR, PWSTR};
use windows::Win32::Foundation::{
    CloseHandle, LocalFree, HANDLE, HLOCAL, WAIT_FAILED, WAIT_OBJECT_0, WAIT_TIMEOUT,
};
use windows::Win32::Security::Authorization::{GetNamedSecurityInfoW, SE_FILE_OBJECT};
use windows::Win32::Security::{
    EqualSid, GetTokenInformation, TokenUser, OWNER_SECURITY_INFORMATION, PSECURITY_DESCRIPTOR,
    PSID, TOKEN_QUERY, TOKEN_USER,
};
use windows::Win32::System::Services::{
    RegisterServiceCtrlHandlerExW, SetServiceStatus, StartServiceCtrlDispatcherW,
    SERVICE_ACCEPT_STOP, SERVICE_CONTROL_INTERROGATE, SERVICE_CONTROL_STOP, SERVICE_RUNNING,
    SERVICE_START_PENDING, SERVICE_STATUS, SERVICE_STATUS_CURRENT_STATE, SERVICE_STATUS_HANDLE,
    SERVICE_STOPPED, SERVICE_STOP_PENDING, SERVICE_TABLE_ENTRYW, SERVICE_WIN32_OWN_PROCESS,
};
use windows::Win32::System::Threading::{
    OpenProcess, OpenProcessToken, WaitForSingleObject, PROCESS_QUERY_LIMITED_INFORMATION,
    PROCESS_SYNCHRONIZE,
};

use super::{dns, SERVICE_NAME};

/// Raw `SERVICE_STATUS_HANDLE.0` value stored as usize so it's trivially
/// Sync-safe across the handler callback and ServiceMain.
static STATUS_HANDLE_RAW: AtomicUsize = AtomicUsize::new(0);
static STOP_REQUESTED: AtomicBool = AtomicBool::new(false);
static CHECKPOINT: AtomicUsize = AtomicUsize::new(0);

const ERROR_CALL_NOT_IMPLEMENTED: u32 = 120;
const NO_ERROR_U32: u32 = 0;

fn to_wide_z(s: &str) -> Vec<u16> {
    OsStr::new(s).encode_wide().chain(Some(0)).collect()
}

fn status_handle() -> SERVICE_STATUS_HANDLE {
    SERVICE_STATUS_HANDLE(STATUS_HANDLE_RAW.load(Ordering::SeqCst) as *mut _)
}

fn set_state(state: SERVICE_STATUS_CURRENT_STATE, exit_code: u32, wait_hint_ms: u32) {
    let h = status_handle();
    if h.is_invalid() {
        return;
    }
    let accepts = if state == SERVICE_RUNNING {
        SERVICE_ACCEPT_STOP
    } else {
        0
    };
    let checkpoint = if state == SERVICE_RUNNING || state == SERVICE_STOPPED {
        0
    } else {
        let prev = CHECKPOINT.fetch_add(1, Ordering::SeqCst);
        (prev + 1) as u32
    };
    let status = SERVICE_STATUS {
        dwServiceType: SERVICE_WIN32_OWN_PROCESS,
        dwCurrentState: state,
        dwControlsAccepted: accepts,
        dwWin32ExitCode: exit_code,
        dwServiceSpecificExitCode: 0,
        dwCheckPoint: checkpoint,
        dwWaitHint: wait_hint_ms,
    };
    unsafe {
        let _ = SetServiceStatus(h, &status);
    }
}

unsafe extern "system" fn handler_ex(
    control: u32,
    _event_type: u32,
    _event_data: *mut core::ffi::c_void,
    _ctx: *mut core::ffi::c_void,
) -> u32 {
    match control {
        c if c == SERVICE_CONTROL_STOP => {
            STOP_REQUESTED.store(true, Ordering::SeqCst);
            set_state(SERVICE_STOP_PENDING, 0, 5000);
            NO_ERROR_U32
        }
        c if c == SERVICE_CONTROL_INTERROGATE => NO_ERROR_U32,
        _ => ERROR_CALL_NOT_IMPLEMENTED,
    }
}

/// Parse API listen port from Xray config JSON.
///
/// Supports v2 shape (`"tag":"api"` + separate `"port"`) and legacy
/// `"listen": "127.0.0.1:PORT"`.
pub(crate) fn parse_api_port_from_config_text(content: &str) -> u16 {
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(content) {
        if let Some(arr) = v.get("inbounds").and_then(|x| x.as_array()) {
            for ib in arr {
                if ib.get("tag").and_then(|t| t.as_str()) == Some("api") {
                    if let Some(p) = ib.get("port").and_then(|p| p.as_u64()) {
                        if p > 0 && p <= u16::MAX as u64 {
                            return p as u16;
                        }
                    }
                }
            }
        }
        if let Some(listen) = v
            .get("api")
            .and_then(|a| a.get("listen"))
            .and_then(|l| l.as_str())
        {
            if let Some((_, port_str)) = listen.rsplit_once(':') {
                if let Ok(port) = port_str.parse::<u16>() {
                    if port > 0 {
                        return port;
                    }
                }
            }
        }
    }
    // Fallback: scan host:port listen strings.
    let mut rest = content;
    while let Some(idx) = rest.find("\"listen\"") {
        rest = &rest[idx + "\"listen\"".len()..];
        let after = rest.trim_start();
        let Some(after_colon) = after.strip_prefix(':') else {
            continue;
        };
        let after_colon = after_colon.trim_start();
        let Some(after_quote) = after_colon.strip_prefix('"') else {
            continue;
        };
        let Some(end) = after_quote.find('"') else {
            continue;
        };
        let value = &after_quote[..end];
        if let Some((_, port_str)) = value.rsplit_once(':') {
            if let Ok(port) = port_str.parse::<u16>() {
                if port > 0 {
                    return port;
                }
            }
        }
    }
    DEFAULT_API_PORT
}

fn api_port_from_config_file(config_path: &str) -> u16 {
    match std::fs::read_to_string(config_path) {
        Ok(content) => parse_api_port_from_config_text(&content),
        Err(e) => {
            dns::log_line(&format!(
                "read config for api port failed ({}): {}; using default {}",
                config_path, e, DEFAULT_API_PORT
            ));
            DEFAULT_API_PORT
        }
    }
}

fn is_allowed_config_path(path: &Path) -> bool {
    let raw = path.to_string_lossy().replace('/', "\\");
    let normalized = raw.strip_prefix(r"\\?\").unwrap_or(&raw);
    if normalized.starts_with(r"UNC\") {
        return false;
    }
    let parts: Vec<&str> = normalized
        .split('\\')
        .filter(|part| !part.is_empty())
        .collect();
    parts.len() == 7
        && parts[0].ends_with(':')
        && parts[1].eq_ignore_ascii_case("Users")
        && !parts[2].is_empty()
        && parts[3].eq_ignore_ascii_case("AppData")
        && (parts[4].eq_ignore_ascii_case("Roaming") || parts[4].eq_ignore_ascii_case("Local"))
        && parts[5].eq_ignore_ascii_case("com.root.aurestream")
        && parts[6].eq_ignore_ascii_case("xray-config.json")
}

fn validate_config_path(config_path: &str) -> Result<PathBuf, String> {
    let requested = Path::new(config_path);
    let canonical = std::fs::canonicalize(requested)
        .map_err(|e| format!("canonicalize config {}: {e}", requested.display()))?;
    if !canonical.is_file() {
        return Err(format!(
            "config is not a regular file: {}",
            canonical.display()
        ));
    }
    if !is_allowed_config_path(&canonical) {
        return Err(format!(
            "config path is outside AureStream app data: {}",
            canonical.display()
        ));
    }
    Ok(canonical)
}

pub(crate) fn parse_tun_outbound_interface_from_config_text(content: &str) -> Option<String> {
    let config = serde_json::from_str::<serde_json::Value>(content).ok()?;
    config
        .get("inbounds")?
        .as_array()?
        .iter()
        .find(|inbound| inbound.get("protocol").and_then(|v| v.as_str()) == Some("tun"))?
        .pointer("/settings/autoOutboundsInterface")?
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty() && !value.eq_ignore_ascii_case("auto"))
        .map(ToOwned::to_owned)
}

fn tun_outbound_interface_from_config_file(config_path: &str) -> Option<String> {
    std::fs::read_to_string(config_path)
        .ok()
        .and_then(|content| parse_tun_outbound_interface_from_config_text(&content))
}

fn probe_localhost_port(port: u16) -> bool {
    let addr = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port);
    TcpStream::connect_timeout(&addr, Duration::from_millis(100)).is_ok()
}

/// Wait until core accepts connections on `port`, the child exits, stop is
/// requested, or `timeout` elapses. Bumps SERVICE_START_PENDING while waiting
/// so SCM does not kill a slow start.
fn wait_for_core_api(
    child: &mut Child,
    app_watch: &AppProcessWatch,
    port: u16,
    timeout: Duration,
) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if STOP_REQUESTED.load(Ordering::SeqCst) {
            dns::log_line("stop requested while waiting for core API");
            return false;
        }
        match app_watch.state() {
            AppProcessState::Running => {}
            AppProcessState::Exited => {
                dns::log_line(&format!(
                    "owning app pid={} exited before core API was ready",
                    app_watch.pid
                ));
                return false;
            }
            AppProcessState::WaitFailed => {
                dns::log_line(&format!(
                    "wait for owning app pid={} failed before core API was ready",
                    app_watch.pid
                ));
                return false;
            }
        }
        match child.try_wait() {
            Ok(Some(status)) => {
                dns::log_line(&format!("core exited before API ready: {:?}", status));
                return false;
            }
            Ok(None) => {}
            Err(e) => {
                dns::log_line(&format!("try_wait error while waiting for API: {}", e));
                return false;
            }
        }
        if probe_localhost_port(port) {
            return true;
        }
        // Keep SCM informed we are still starting (long TUN/Wintun init).
        set_state(
            SERVICE_START_PENDING,
            0,
            timeout.as_millis().min(20_000) as u32,
        );
        std::thread::sleep(Duration::from_millis(100));
    }
    false
}

fn flush_dns_cache() {
    match std::process::Command::new("ipconfig")
        .arg("/flushdns")
        .creation_flags(CREATE_NO_WINDOW)
        .output()
    {
        Ok(o) if o.status.success() => dns::log_line("ipconfig /flushdns OK"),
        Ok(o) => dns::log_line(&format!(
            "ipconfig /flushdns non-zero: {}",
            String::from_utf8_lossy(&o.stderr).trim()
        )),
        Err(e) => dns::log_line(&format!("ipconfig /flushdns spawn failed: {}", e)),
    }
}

fn apply_dns_override_after_ready(gateway: &str, outbound_interface: Option<&str>) {
    let (ok, err) = dns::apply_override(gateway, outbound_interface);
    dns::log_line(&format!(
        "apply_override: interface={:?} ok={} err={}",
        outbound_interface, ok, err
    ));
    // Flush after override so apps pick up the TUN gateway NameServer and
    // drop any pre-TUN negative cache entries.
    flush_dns_cache();
}

fn parse_app_pid(value: &str) -> Result<u32, String> {
    if value.is_empty() || !value.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err("app PID must contain ASCII decimal digits only".into());
    }
    let pid = value
        .parse::<u32>()
        .map_err(|_| "app PID is outside the supported u32 range".to_string())?;
    if pid == 0 {
        return Err("app PID must be greater than zero".into());
    }
    Ok(pid)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum AppProcessState {
    Running,
    Exited,
    WaitFailed,
}

struct AppProcessWatch {
    handle: HANDLE,
    pid: u32,
}

impl AppProcessWatch {
    fn open(pid: u32) -> Result<Self, String> {
        if pid == std::process::id() {
            return Err("app PID points to the TUN service process".into());
        }
        let handle = unsafe { OpenProcess(PROCESS_SYNCHRONIZE, false, pid) }
            .map_err(|e| format!("OpenProcess(app pid={pid}) failed: {e}"))?;
        let watch = Self { handle, pid };
        match watch.state() {
            AppProcessState::Running => Ok(watch),
            AppProcessState::Exited => Err(format!("app process pid={pid} already exited")),
            AppProcessState::WaitFailed => {
                Err(format!("initial wait for app process pid={pid} failed"))
            }
        }
    }

    fn state(&self) -> AppProcessState {
        match unsafe { WaitForSingleObject(self.handle, 0) } {
            value if value == WAIT_TIMEOUT => AppProcessState::Running,
            value if value == WAIT_OBJECT_0 => AppProcessState::Exited,
            value if value == WAIT_FAILED => AppProcessState::WaitFailed,
            _ => AppProcessState::WaitFailed,
        }
    }
}

impl Drop for AppProcessWatch {
    fn drop(&mut self) {
        let _ = unsafe { CloseHandle(self.handle) };
    }
}

/// A process token's owner SID, backed by the heap buffer holding the
/// `TOKEN_USER` returned by `GetTokenInformation`. The SID returned by
/// `sid()` points into this buffer, so the buffer must outlive its use.
struct ProcessOwnerToken {
    buf: Vec<u8>,
}

impl ProcessOwnerToken {
    fn sid(&self) -> PSID {
        let token_user = self.buf.as_ptr() as *const TOKEN_USER;
        unsafe { (*token_user).User.Sid }
    }
}

/// Look up the SID of the account that owns process `pid`'s token. Used by
/// `caller_owns_config` to verify a service-start caller's real identity.
fn process_token_owner_sid(pid: u32) -> Result<ProcessOwnerToken, String> {
    let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) }
        .map_err(|e| format!("OpenProcess(app pid={pid}) for owner check failed: {e}"))?;
    let result = (|| -> Result<ProcessOwnerToken, String> {
        let mut token = HANDLE::default();
        unsafe { OpenProcessToken(process, TOKEN_QUERY, &mut token) }
            .map_err(|e| format!("OpenProcessToken(app pid={pid}) failed: {e}"))?;
        let token_result = (|| -> Result<ProcessOwnerToken, String> {
            let mut len: u32 = 0;
            // First call is expected to fail (buffer too small); it reports
            // the required size in `len`. Do not assume a fixed size.
            let _ = unsafe { GetTokenInformation(token, TokenUser, None, 0, &mut len) };
            if len == 0 {
                return Err(format!(
                    "GetTokenInformation size probe returned 0 for app pid={pid}"
                ));
            }
            let mut buf = vec![0u8; len as usize];
            unsafe {
                GetTokenInformation(
                    token,
                    TokenUser,
                    Some(buf.as_mut_ptr() as *mut core::ffi::c_void),
                    len,
                    &mut len,
                )
            }
            .map_err(|e| format!("GetTokenInformation(TokenUser, app pid={pid}) failed: {e}"))?;
            Ok(ProcessOwnerToken { buf })
        })();
        unsafe {
            let _ = CloseHandle(token);
        }
        token_result
    })();
    unsafe {
        let _ = CloseHandle(process);
    }
    result
}

/// A file's owner SID, backed by the `PSECURITY_DESCRIPTOR` allocated by
/// `GetNamedSecurityInfoW`. Freed via `LocalFree` on drop.
struct ConfigOwnerSid {
    psd: PSECURITY_DESCRIPTOR,
    owner: PSID,
}

impl Drop for ConfigOwnerSid {
    fn drop(&mut self) {
        unsafe {
            let _ = LocalFree(Some(HLOCAL(self.psd.0)));
        }
    }
}

/// Look up the on-disk owner SID of `config` (expected to already be
/// canonicalized by `validate_config_path`).
fn config_owner_sid(config: &Path) -> Result<ConfigOwnerSid, String> {
    let path_w = to_wide_z(&config.to_string_lossy());
    let mut owner = PSID::default();
    let mut psd = PSECURITY_DESCRIPTOR::default();
    let status = unsafe {
        GetNamedSecurityInfoW(
            PCWSTR(path_w.as_ptr()),
            SE_FILE_OBJECT,
            OWNER_SECURITY_INFORMATION,
            Some(&mut owner as *mut PSID),
            None,
            None,
            None,
            &mut psd,
        )
    };
    if let Err(e) = status.ok() {
        unsafe {
            let _ = LocalFree(Some(HLOCAL(psd.0)));
        }
        return Err(format!(
            "GetNamedSecurityInfoW({}) failed: {e}",
            config.display()
        ));
    }
    if owner.0.is_null() {
        unsafe {
            let _ = LocalFree(Some(HLOCAL(psd.0)));
        }
        return Err(format!("config owner SID is null: {}", config.display()));
    }
    Ok(ConfigOwnerSid { psd, owner })
}

/// Reject a service-start request unless `config` is actually owned (on
/// disk, by SID) by the account running the calling app process `app_pid`.
///
/// `is_allowed_config_path` only checks the path SHAPE
/// (`...\Users\<name>\AppData\...\xray-config.json`) — it never verifies
/// that `<name>` is really the caller's account. Combined with
/// `SERVICE_SDDL` (scm.rs) granting SERVICE_START to all local Authenticated
/// Users, any standard user could otherwise start this SYSTEM service
/// against a config they authored under their own profile. Comparing SIDs
/// (not the path string) closes that gap regardless of the SDDL and is
/// immune to username case/encoding quirks.
fn caller_owns_config(config: &Path, app_pid: u32) -> Result<(), String> {
    let config_owner = config_owner_sid(config)?;
    let process_owner = process_token_owner_sid(app_pid)?;
    let equal = unsafe { EqualSid(config_owner.owner, process_owner.sid()) }.is_ok();
    if !equal {
        return Err(format!(
            "config file owner does not match owning app process pid={app_pid}"
        ));
    }
    Ok(())
}

/// The SCM-invoked service entry point.
unsafe extern "system" fn service_main(argc: u32, argv: *mut PWSTR) {
    // Parse argv.
    let args: Vec<String> = (0..argc as isize)
        .map(|i| {
            let ptr = *argv.offset(i);
            if ptr.is_null() {
                String::new()
            } else {
                let mut len = 0usize;
                while *ptr.0.add(len) != 0 {
                    len += 1;
                }
                let slice = std::slice::from_raw_parts(ptr.0, len);
                String::from_utf16_lossy(slice)
            }
        })
        .collect();

    // Register control handler.
    let name_w = to_wide_z(SERVICE_NAME);
    let handle =
        match RegisterServiceCtrlHandlerExW(PCWSTR(name_w.as_ptr()), Some(handler_ex), None) {
            Ok(h) => h,
            Err(e) => {
                dns::log_line(&format!("RegisterServiceCtrlHandlerExW failed: {}", e));
                return;
            }
        };
    STATUS_HANDLE_RAW.store(handle.0 as usize, Ordering::SeqCst);
    // Long wait hint: core + Wintun init + API probe can exceed the old 5s.
    set_state(SERVICE_START_PENDING, 0, 20_000);

    // Main app deleted → self-uninstall (same idea as macOS helper orphan cleanup).
    if super::scm::orphan_check_and_cleanup() {
        dns::log_line("service_main: aborted — orphan cleanup removed tun-service");
        set_state(SERVICE_STOPPED, 1, 0);
        return;
    }

    // argv[0] = service name; argv[1] = config; argv[2] = gateway;
    // argv[3] = owning AureStream process PID.
    if args.len() != 4 {
        dns::log_line(&format!(
            "service_main: expected 4 args, got {}: {:?}",
            args.len(),
            args
        ));
        set_state(SERVICE_STOPPED, 1, 0);
        return;
    }
    let config = match validate_config_path(&args[1]) {
        Ok(path) => path,
        Err(e) => {
            dns::log_line(&format!("service_main: rejected config path: {e}"));
            set_state(SERVICE_STOPPED, 1, 0);
            return;
        }
    };
    let gateway = args[2].clone();
    if gateway.parse::<IpAddr>().is_err() {
        dns::log_line(&format!("service_main: rejected DNS address: {gateway}"));
        set_state(SERVICE_STOPPED, 1, 0);
        return;
    }
    let app_pid = match parse_app_pid(&args[3]) {
        Ok(pid) => pid,
        Err(e) => {
            dns::log_line(&format!("service_main: rejected app PID: {e}"));
            set_state(SERVICE_STOPPED, 1, 0);
            return;
        }
    };
    // SID-based authorization: `is_allowed_config_path` only validated the
    // path SHAPE, not that the caller (app_pid) actually owns this config
    // file. Any Authenticated User can call StartServiceW (see SERVICE_SDDL
    // in scm.rs), so without this check any standard user could point the
    // SYSTEM service at a config file they authored under their own profile.
    if let Err(e) = caller_owns_config(&config, app_pid) {
        dns::log_line(&format!(
            "service_main: rejected caller/config owner mismatch: {e}"
        ));
        set_state(SERVICE_STOPPED, 1, 0);
        return;
    }
    // Open the process before starting the privileged core. A process handle
    // refers to this exact process object and remains signaled after exit, so
    // a subsequently reused numeric PID cannot defeat orphan cleanup.
    let app_watch = match AppProcessWatch::open(app_pid) {
        Ok(watch) => watch,
        Err(e) => {
            dns::log_line(&format!("service_main: cannot watch app process: {e}"));
            set_state(SERVICE_STOPPED, 1, 0);
            return;
        }
    };
    let sidecar = match super::scm::verified_installed_core_path() {
        Ok(path) => path,
        Err(e) => {
            dns::log_line(&format!(
                "service_main: trusted core verification failed: {e}"
            ));
            set_state(SERVICE_STOPPED, 1, 0);
            return;
        }
    };
    let config_text = config.to_string_lossy();
    let api_port = api_port_from_config_file(&config_text);
    let outbound_interface = tun_outbound_interface_from_config_file(&config_text);

    dns::log_line(&format!(
        "service_main: config={} gateway={} sidecar={} api_port={} interface={:?} app_pid={}",
        config.display(),
        gateway,
        sidecar.display(),
        api_port,
        outbound_interface,
        app_watch.pid
    ));

    // Spawn core FIRST (before DNS override). `CREATE_NO_WINDOW` is required —
    // without it the service (which has no console) spawning a console-subsystem
    // child causes Windows to pop a fresh terminal on the user's desktop.
    // stdout/stderr are piped so we can log core output for diagnostics.
    //
    // cwd = sidecar directory so relative asset lookups (if any) and so
    // operators inspecting Process Explorer see a sensible working dir.
    // Xray loads wintun.dll / geo*.dat from the exe directory itself, which
    // the main app stages next to aurestream-core.exe on startup.
    let sidecar_dir = sidecar
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| std::path::PathBuf::from("."));
    let mut child = match std::process::Command::new(&sidecar)
        .arg("run")
        .arg("-c")
        .arg(&config)
        .current_dir(&sidecar_dir)
        .creation_flags(CREATE_NO_WINDOW)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            dns::log_line(&format!("core spawn failed: {}", e));
            set_state(SERVICE_STOPPED, 1, 0);
            return;
        }
    };
    dns::log_line(&format!("core spawned pid={}", child.id()));

    // Spawn reader threads to capture core output into the service log.
    if let Some(stdout) = child.stdout.take() {
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                if let Ok(l) = line {
                    dns::log_line(&format!("[core] {}", l));
                }
            }
        });
    }
    if let Some(stderr) = child.stderr.take() {
        std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines() {
                if let Ok(l) = line {
                    dns::log_line(&format!("[core:err] {}", l));
                }
            }
        });
    }

    // Wait until Xray API is up (TUN/Wintun + listeners ready) before hijacking
    // system DNS. Otherwise NameServer=gateway with no responder = total outage.
    if !wait_for_core_api(&mut child, &app_watch, api_port, CORE_READY_TIMEOUT) {
        dns::log_line(&format!(
            "core API :{} not ready within {:?}; aborting start",
            api_port, CORE_READY_TIMEOUT
        ));
        let _ = child.kill();
        let _ = child.wait();
        set_state(SERVICE_STOPPED, 1, 0);
        return;
    }
    dns::log_line(&format!("core API :{} ready", api_port));

    // Now safe to point physical NICs at the TUN gateway DNS.
    apply_dns_override_after_ready(&gateway, outbound_interface.as_deref());

    set_state(SERVICE_RUNNING, 0, 0);

    // Main loop: 200ms tick on child/app process state and STOP_REQUESTED.
    let mut unexpected_exit_code: Option<i32> = None;
    loop {
        if STOP_REQUESTED.load(Ordering::SeqCst) {
            dns::log_line("stop requested; killing child");
            let _ = child.kill();
            break;
        }
        match app_watch.state() {
            AppProcessState::Running => {}
            AppProcessState::Exited => {
                dns::log_line(&format!(
                    "owning app pid={} exited; killing core and stopping service",
                    app_watch.pid
                ));
                let _ = child.kill();
                break;
            }
            AppProcessState::WaitFailed => {
                dns::log_line(&format!(
                    "wait for owning app pid={} failed; killing core and stopping service",
                    app_watch.pid
                ));
                let _ = child.kill();
                unexpected_exit_code = Some(1);
                break;
            }
        }
        match child.try_wait() {
            Ok(Some(status)) => {
                dns::log_line(&format!("core exited unexpectedly: {:?}", status));
                unexpected_exit_code = Some(status.code().unwrap_or(1));
                break;
            }
            Ok(None) => {}
            Err(e) => {
                dns::log_line(&format!("try_wait error: {}", e));
                let _ = child.kill();
                unexpected_exit_code = Some(1);
                break;
            }
        }
        std::thread::sleep(Duration::from_millis(200));
    }

    set_state(SERVICE_STOP_PENDING, 0, 5000);
    // Ensure the privileged core is gone before restoring host DNS. `kill()`
    // only requests termination; waiting here makes the teardown ordering
    // deterministic for both explicit stops and app-process disappearance.
    let _ = child.wait();

    // Remove only the TUN gateway we inserted after core was ready.
    let (r_ok, r_err) = dns::remove_override(&gateway);
    dns::log_line(&format!("remove_override: ok={} err={}", r_ok, r_err));
    flush_dns_cache();

    let exit = unexpected_exit_code.unwrap_or(0) as u32;
    set_state(SERVICE_STOPPED, exit, 0);
}

/// Entry point for the service binary. Blocks in the SCM dispatcher until
/// the service exits. Returns 0 on success, 1 on dispatcher failure.
pub fn run_dispatcher() -> i32 {
    let mut name_w = to_wide_z(SERVICE_NAME);
    let table = [
        SERVICE_TABLE_ENTRYW {
            lpServiceName: PWSTR(name_w.as_mut_ptr()),
            lpServiceProc: Some(service_main),
        },
        SERVICE_TABLE_ENTRYW {
            lpServiceName: PWSTR(std::ptr::null_mut()),
            lpServiceProc: None,
        },
    ];
    match unsafe { StartServiceCtrlDispatcherW(table.as_ptr()) } {
        Ok(()) => 0,
        Err(e) => {
            dns::log_line(&format!("StartServiceCtrlDispatcherW failed: {}", e));
            1
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_app_pid_accepts_only_nonzero_ascii_u32() {
        assert_eq!(parse_app_pid("1"), Ok(1));
        assert_eq!(parse_app_pid("4294967295"), Ok(u32::MAX));

        for invalid in [
            "",
            "0",
            " 42",
            "42 ",
            "+42",
            "-1",
            "１２",
            "4294967296",
            "12a",
        ] {
            assert!(
                parse_app_pid(invalid).is_err(),
                "PID input should be rejected: {invalid:?}"
            );
        }
    }

    #[test]
    fn parse_api_port_from_typical_xray_config() {
        let json = r#"{
          "api": {
            "tag": "api",
            "listen": "127.0.0.1:9191",
            "services": ["HandlerService"]
          },
          "inbounds": [
            {
              "tag": "mixed-in",
              "listen": "127.0.0.1",
              "port": 2345,
              "protocol": "socks"
            }
          ]
        }"#;
        assert_eq!(parse_api_port_from_config_text(json), 9191);
    }

    #[test]
    fn parse_api_port_custom_and_fallback() {
        let custom = r#"{"api":{"listen":"127.0.0.1:19291"}}"#;
        assert_eq!(parse_api_port_from_config_text(custom), 19291);
        assert_eq!(parse_api_port_from_config_text("{}"), DEFAULT_API_PORT);
        let v2 = r#"{"inbounds":[{"tag":"api","listen":"127.0.0.1","port":10809}]}"#;
        assert_eq!(parse_api_port_from_config_text(v2), 10809);
        assert_eq!(
            parse_api_port_from_config_text(r#"{"inbounds":[{"listen":"0.0.0.0"}]}"#),
            DEFAULT_API_PORT
        );
    }

    #[test]
    fn parse_tun_outbound_interface_requires_patched_physical_name() {
        let patched = r#"{
          "inbounds": [{
            "protocol": "tun",
            "settings": {"autoOutboundsInterface": "以太网"}
          }]
        }"#;
        assert_eq!(
            parse_tun_outbound_interface_from_config_text(patched).as_deref(),
            Some("以太网")
        );

        let auto = r#"{
          "inbounds": [{
            "protocol": "tun",
            "settings": {"autoOutboundsInterface": "auto"}
          }]
        }"#;
        assert_eq!(parse_tun_outbound_interface_from_config_text(auto), None);
    }

    #[test]
    fn config_path_allowlist_accepts_only_app_data_config() {
        assert!(is_allowed_config_path(Path::new(
            r"C:\Users\alice\AppData\Roaming\com.root.aurestream\xray-config.json"
        )));
        assert!(is_allowed_config_path(Path::new(
            r"\\?\D:\Users\alice\AppData\Local\com.root.aurestream\xray-config.json"
        )));
        assert!(!is_allowed_config_path(Path::new(
            r"C:\Users\alice\AppData\Local\com.root.aurestream\other.json"
        )));
        assert!(!is_allowed_config_path(Path::new(
            r"C:\Temp\com.root.aurestream\xray-config.json"
        )));
    }

    #[test]
    fn config_path_allowlist_rejects_escape_and_unc_paths() {
        assert!(!is_allowed_config_path(Path::new(
            r"C:\Users\alice\AppData\Local\com.root.aurestream\..\evil\xray-config.json"
        )));
        assert!(!is_allowed_config_path(Path::new(
            r"\\server\share\Users\alice\AppData\Local\com.root.aurestream\xray-config.json"
        )));
        assert!(!is_allowed_config_path(Path::new(
            r"C:\Users\alice\AppData\LocalLow\com.root.aurestream\xray-config.json"
        )));
    }
}
