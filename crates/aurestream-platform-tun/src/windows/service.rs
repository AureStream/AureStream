//! ServiceMain dispatcher for the OneBox TUN service.
//!
//! SCM invokes `service_main` with argv that includes the service arguments
//! passed by `StartServiceW` in the client. We parse:
//!   argv[0] = service name (ignored)
//!   argv[1] = core config path
//!   argv[2] = OS DNS hijack IP from tun.settings.dns[0] (e.g. 1.1.1.1),
//!             or "-" to skip DNS override. Not the TUN gateway address.
//!   argv[3] = core exe path
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
use windows::Win32::System::Services::{
    RegisterServiceCtrlHandlerExW, SetServiceStatus, StartServiceCtrlDispatcherW,
    SERVICE_ACCEPT_STOP, SERVICE_CONTROL_INTERROGATE, SERVICE_CONTROL_STOP, SERVICE_RUNNING,
    SERVICE_START_PENDING, SERVICE_STATUS, SERVICE_STATUS_CURRENT_STATE, SERVICE_STATUS_HANDLE,
    SERVICE_STOPPED, SERVICE_STOP_PENDING, SERVICE_TABLE_ENTRYW, SERVICE_WIN32_OWN_PROCESS,
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
        if let Some(listen) = v.get("api").and_then(|a| a.get("listen")).and_then(|l| l.as_str()) {
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
fn wait_for_core_api(child: &mut Child, port: u16, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if STOP_REQUESTED.load(Ordering::SeqCst) {
            dns::log_line("stop requested while waiting for core API");
            return false;
        }
        match child.try_wait() {
            Ok(Some(status)) => {
                dns::log_line(&format!(
                    "core exited before API ready: {:?}",
                    status
                ));
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

    // argv[0] = service name; argv[1] = config; argv[2] = gateway; argv[3] = core exe.
    if args.len() < 4 {
        dns::log_line(&format!(
            "service_main: expected 4 args, got {}: {:?}",
            args.len(),
            args
        ));
        set_state(SERVICE_STOPPED, 1, 0);
        return;
    }
    let config = args[1].clone();
    let gateway = args[2].clone();
    let sidecar = args[3].clone();
    let api_port = api_port_from_config_file(&config);
    let outbound_interface = tun_outbound_interface_from_config_file(&config);

    dns::log_line(&format!(
        "service_main: config={} gateway={} sidecar={} api_port={} interface={:?}",
        config, gateway, sidecar, api_port, outbound_interface
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
    let sidecar_dir = std::path::Path::new(&sidecar)
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| std::path::PathBuf::from("."));
    let mut child = match std::process::Command::new(&sidecar)
        .args(["run", "-c", &config])
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
    if !wait_for_core_api(&mut child, api_port, CORE_READY_TIMEOUT) {
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

    // Main loop: 200ms tick on child.try_wait() and STOP_REQUESTED.
    let mut unexpected_exit_code: Option<i32> = None;
    loop {
        if STOP_REQUESTED.load(Ordering::SeqCst) {
            dns::log_line("stop requested; killing child");
            let _ = child.kill();
            break;
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
}
