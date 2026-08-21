//! Elevated systemd helper: Unix-socket control plane + core/DNS lifecycle.

use super::protocol::{
    decode_request, encode_response, socket_path, TunRequest, TunResponse, RUNTIME_DIR,
};
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::net::TcpStream;
use std::os::fd::{FromRawFd, OwnedFd};
use std::os::unix::fs::PermissionsExt;
use std::os::unix::io::AsRawFd;
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

const HELPER_DIR: &str = "/usr/lib/AureStream";
const TRUSTED_CORE: &str = "/usr/lib/AureStream/aurestream-core";
const PACKAGED_CORE: &str = "/usr/bin/aurestream-core";
const TRUSTED_ASSETS: &str = "/usr/lib/AureStream/resources";
const SOCKET_UNIT_PATH: &str = "/etc/systemd/system/aurestream-tun.socket";
const SERVICE_UNIT_PATH: &str = "/etc/systemd/system/aurestream-tun.service";
const ORPHAN_TIMER_UNIT: &str = "aurestream-tun-orphan.timer";
const ORPHAN_SERVICE_UNIT: &str = "aurestream-tun-orphan.service";
const SYSTEMD_DIR: &str = "/etc/systemd/system";
const API_READY_TIMEOUT: Duration = Duration::from_secs(20);
const SD_LISTEN_FDS_START: i32 = 3;

struct Session {
    core: Child,
    caller_pid: u32,
    caller_uid: u32,
    caller_start: String,
    iface: String,
    original_dns: Vec<String>,
    session_dir: PathBuf,
}

pub fn helper_main(args: &[String]) -> i32 {
    let cmd = args.get(1).map(String::as_str).unwrap_or("serve");
    let result = match cmd {
        "serve" => serve_loop(),
        "uninstall" => uninstall(),
        "orphan-check" => orphan_check(),
        "install-units" | "install-orphan-timer" => install_units(),
        "stop-tun" => {
            // Compat: tear down leftover sessions without the socket client.
            teardown_all();
            Ok(())
        }
        other => {
            eprintln!(
                "Usage: aurestream-tun-helper {{serve|stop-tun|uninstall|orphan-check|install-units}}"
            );
            eprintln!("unknown command: {other}");
            return 2;
        }
    };
    match result {
        Ok(()) => 0,
        Err(e) => {
            eprintln!("{e}");
            1
        }
    }
}

fn serve_loop() -> Result<(), String> {
    let listener = take_listener()?;
    let session: Arc<Mutex<Option<Session>>> = Arc::new(Mutex::new(None));
    {
        let session = Arc::clone(&session);
        thread::spawn(move || watchdog_loop(session));
    }
    eprintln!("[tun-helper] listening on {}", socket_path().display());
    for incoming in listener.incoming() {
        match incoming {
            Ok(stream) => {
                if let Err(e) = handle_client(stream, &session) {
                    eprintln!("[tun-helper] client error: {e}");
                }
            }
            Err(e) => eprintln!("[tun-helper] accept: {e}"),
        }
    }
    Ok(())
}

fn ensure_runtime_dir_world_traversable() {
    let dir = Path::new(RUNTIME_DIR);
    let _ = fs::create_dir_all(dir);
    let _ = fs::set_permissions(dir, fs::Permissions::from_mode(0o755));
}

fn take_listener() -> Result<UnixListener, String> {
    ensure_runtime_dir_world_traversable();
    if let Some(listener) = systemd_activated_listener() {
        return Ok(listener);
    }
    let path = socket_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create runtime dir: {e}"))?;
        let _ = fs::set_permissions(parent, fs::Permissions::from_mode(0o755));
    }
    let _ = fs::remove_file(&path);
    let listener = UnixListener::bind(&path).map_err(|e| format!("bind {}: {e}", path.display()))?;
    let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o666));
    Ok(listener)
}

fn systemd_activated_listener() -> Option<UnixListener> {
    let listen_pid: u32 = std::env::var("LISTEN_PID").ok()?.parse().ok()?;
    if listen_pid != std::process::id() {
        return None;
    }
    let n: u32 = std::env::var("LISTEN_FDS").ok()?.parse().ok()?;
    if n < 1 {
        return None;
    }
    let fd = unsafe { OwnedFd::from_raw_fd(SD_LISTEN_FDS_START) };
    Some(UnixListener::from(fd))
}

fn handle_client(stream: UnixStream, session: &Arc<Mutex<Option<Session>>>) -> Result<(), String> {
    let uid = peer_uid(&stream)?;
    let mut reader = BufReader::new(stream.try_clone().map_err(|e| e.to_string())?);
    let mut line = String::new();
    reader
        .read_line(&mut line)
        .map_err(|e| format!("read: {e}"))?;
    let req = decode_request(&line)?;
    let resp = match req {
        TunRequest::Status => {
            let running = session
                .lock()
                .map(|g| g.as_ref().is_some())
                .unwrap_or(false);
            TunResponse::ok_state(if running { "running" } else { "idle" })
        }
        TunRequest::Stop => match stop_session(session) {
            Ok(()) => TunResponse::ok_state("idle"),
            Err(e) => TunResponse::fail("idle", e),
        },
        TunRequest::Start {
            config,
            caller_pid,
            api_port,
            dns,
            iface,
            original_dns,
        } => match start_session(
            session,
            uid,
            Path::new(&config),
            caller_pid,
            api_port,
            &dns,
            &iface,
            &original_dns,
        ) {
            Ok(()) => TunResponse::ok_state("running"),
            Err(e) => TunResponse::fail("idle", e),
        },
    };
    let encoded = encode_response(&resp).map_err(|e| e.to_string())?;
    let mut writer = stream;
    writer
        .write_all(encoded.as_bytes())
        .and_then(|_| writer.flush())
        .map_err(|e| format!("write: {e}"))
}

fn peer_uid(stream: &UnixStream) -> Result<u32, String> {
    unsafe {
        let mut ucred: libc::ucred = std::mem::zeroed();
        let mut len = std::mem::size_of::<libc::ucred>() as libc::socklen_t;
        let ret = libc::getsockopt(
            stream.as_raw_fd(),
            libc::SOL_SOCKET,
            libc::SO_PEERCRED,
            &mut ucred as *mut _ as *mut libc::c_void,
            &mut len,
        );
        if ret != 0 {
            return Err(format!("SO_PEERCRED: {}", std::io::Error::last_os_error()));
        }
        Ok(ucred.uid)
    }
}

/// Mirrors the intent of com.root.aurestream.run-privileged in
/// linux-helper/49-aurestream.rules: only members of the distro's admin
/// group may start a tunnel session (any local user may stop/query one).
fn caller_is_authorized(uid: u32) -> bool {
    let output = match Command::new("id").args(["-Gn", &uid.to_string()]).output() {
        Ok(o) if o.status.success() => o,
        _ => return false,
    };
    let groups = String::from_utf8_lossy(&output.stdout);
    groups
        .split_whitespace()
        .any(|g| g == "sudo" || g == "wheel" || g == "adm")
}

fn start_session(
    slot: &Arc<Mutex<Option<Session>>>,
    uid: u32,
    config: &Path,
    caller_pid: u32,
    api_port: u16,
    dns: &str,
    iface: &str,
    original_dns: &[String],
) -> Result<(), String> {
    if !caller_is_authorized(uid) {
        return Err("caller is not authorized to start the vpn tunnel (must be in the sudo/wheel/adm group)".into());
    }
    if !validate_iface(iface) {
        return Err("invalid interface".into());
    }
    if !validate_dns(dns) {
        return Err("invalid dns gateway".into());
    }
    for server in original_dns {
        if !validate_dns(server) {
            return Err("invalid original DNS server".into());
        }
    }
    let caller_start = validate_caller(caller_pid, uid)?;
    let config = resolve_config_for(config, uid)?;
    let sidecar = resolve_kernel()?;

    {
        let mut guard = slot.lock().map_err(|e| e.to_string())?;
        if let Some(existing) = guard.take() {
            teardown_session(existing);
        }
    }
    teardown_all();

    let assets = Path::new(TRUSTED_ASSETS);
    if assets.is_dir() {
        std::env::set_var("XRAY_LOCATION_ASSET", assets);
        let _ = std::env::set_current_dir(assets);
    } else if let Some(dir) = sidecar.parent() {
        std::env::set_var("XRAY_LOCATION_ASSET", dir);
        let _ = std::env::set_current_dir(dir);
    }

    let runtime = Path::new(RUNTIME_DIR);
    fs::create_dir_all(runtime).map_err(|e| format!("runtime dir: {e}"))?;
    let _ = fs::set_permissions(runtime, fs::Permissions::from_mode(0o755));
    let session_dir = runtime.join(format!("session-{caller_pid}"));
    if session_dir.exists() {
        let _ = fs::remove_dir_all(&session_dir);
    }
    fs::create_dir_all(&session_dir).map_err(|e| format!("session dir: {e}"))?;
    let _ = fs::set_permissions(&session_dir, fs::Permissions::from_mode(0o700));
    let snap = session_dir.join("config.json");
    fs::copy(&config, &snap).map_err(|e| format!("copy config: {e}"))?;
    let _ = fs::set_permissions(&snap, fs::Permissions::from_mode(0o600));

    let mut child = Command::new(&sidecar)
        .arg("run")
        .arg("-c")
        .arg(&snap)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("spawn core: {e}"))?;
    let core_pid = child.id();
    eprintln!("[tun-helper] core pid={core_pid} api={api_port}");

    if !wait_api_ready(api_port, &mut child) {
        let _ = child.kill();
        let _ = child.wait();
        let _ = fs::remove_dir_all(&session_dir);
        return Err(format!("core API :{api_port} not ready"));
    }

    if !iface.is_empty() {
        if let Err(e) = apply_dns(iface, dns) {
            let _ = child.kill();
            let _ = child.wait();
            let _ = restore_dns(iface, original_dns);
            let _ = fs::remove_dir_all(&session_dir);
            return Err(e);
        }
    }

    let mut guard = slot.lock().map_err(|e| e.to_string())?;
    *guard = Some(Session {
        core: child,
        caller_pid,
        caller_uid: uid,
        caller_start,
        iface: iface.to_string(),
        original_dns: original_dns.to_vec(),
        session_dir,
    });
    Ok(())
}

fn stop_session(slot: &Arc<Mutex<Option<Session>>>) -> Result<(), String> {
    let existing = {
        let mut guard = slot.lock().map_err(|e| e.to_string())?;
        guard.take()
    };
    if let Some(session) = existing {
        teardown_session(session);
    } else {
        teardown_all();
    }
    Ok(())
}

fn teardown_session(mut session: Session) {
    let _ = session.core.kill();
    let deadline = Instant::now() + Duration::from_secs(3);
    loop {
        match session.core.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if Instant::now() < deadline => thread::sleep(Duration::from_millis(50)),
            _ => {
                let _ = session.core.kill();
                let _ = session.core.wait();
                break;
            }
        }
    }
    let _ = restore_dns(&session.iface, &session.original_dns);
    let _ = fs::remove_dir_all(&session.session_dir);
    pkill_cores();
    let _ = delete_iface_if_present("utun233");
}

fn teardown_all() {
    pkill_cores();
    if let Ok(entries) = fs::read_dir(RUNTIME_DIR) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if name.starts_with("session-") {
                let _ = fs::remove_dir_all(entry.path());
            }
        }
    }
    let _ = delete_iface_if_present("utun233");
}

fn watchdog_loop(slot: Arc<Mutex<Option<Session>>>) {
    loop {
        thread::sleep(Duration::from_secs(1));
        let dead = {
            let mut guard = match slot.lock() {
                Ok(g) => g,
                Err(_) => continue,
            };
            match guard.as_mut() {
                Some(s) => {
                    let caller_dead =
                        !caller_is_alive(s.caller_pid, s.caller_uid, &s.caller_start);
                    let core_dead = s.core.try_wait().ok().flatten().is_some();
                    caller_dead || core_dead
                }
                None => false,
            }
        };
        if dead {
            eprintln!("[tun-helper] caller or core gone; tearing down");
            let _ = stop_session(&slot);
        }
    }
}

fn wait_api_ready(port: u16, child: &mut Child) -> bool {
    let deadline = Instant::now() + API_READY_TIMEOUT;
    while Instant::now() < deadline {
        if child.try_wait().ok().flatten().is_some() {
            return false;
        }
        if TcpStream::connect_timeout(
            &([127, 0, 0, 1], port).into(),
            Duration::from_millis(80),
        )
        .is_ok()
        {
            return true;
        }
        thread::sleep(Duration::from_millis(100));
    }
    false
}

fn apply_dns(iface: &str, gateway: &str) -> Result<(), String> {
    let status = Command::new("resolvectl")
        .args(["dns", iface, gateway])
        .status()
        .map_err(|e| format!("resolvectl dns: {e}"))?;
    if !status.success() {
        return Err(format!("dns-override failed for iface={iface}"));
    }
    // Send all lookups through this link so stub/cache cannot keep using a
    // previous (possibly poisoned) answer after the hijack.
    let _ = Command::new("resolvectl")
        .args(["domain", iface, "~."])
        .status();
    flush_resolver_caches();
    Ok(())
}

fn restore_dns(iface: &str, original: &[String]) {
    if iface.is_empty() {
        return;
    }
    // Revert drops per-link `domain ~.` from apply_dns, then put back the
    // captured servers when we have them (NetworkManager may overwrite later).
    let _ = Command::new("resolvectl").args(["revert", iface]).status();
    if !original.is_empty() {
        let mut cmd = Command::new("resolvectl");
        cmd.arg("dns").arg(iface);
        for server in original {
            cmd.arg(server);
        }
        let _ = cmd.status();
    }
    flush_resolver_caches();
}

fn flush_resolver_caches() {
    for args in [["flush-caches"].as_slice(), ["reset-server-features"].as_slice()] {
        match Command::new("resolvectl").args(args).status() {
            Ok(status) if status.success() => {}
            Ok(status) => eprintln!(
                "[tun-helper] resolvectl {} failed: {status}",
                args.join(" ")
            ),
            Err(e) => eprintln!(
                "[tun-helper] resolvectl {}: {e}",
                args.join(" ")
            ),
        }
    }
}

/// Orphan cleanup for cores this helper spawned in a prior life (e.g. after
/// a helper restart that lost the in-memory `Session`/`Child` handle) — not
/// used when a live `Child` is available, which is killed directly instead.
/// Matches on the exact trusted core path AND root ownership rather than a
/// `pkill -f` substring match, so it can never hit another local user's
/// process whose argv happens to contain "/aurestream-core".
fn pkill_cores() {
    let entries = match fs::read_dir("/proc") {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let pid: i32 = match entry.file_name().to_str().and_then(|s| s.parse().ok()) {
            Some(pid) => pid,
            None => continue,
        };
        let exe = match fs::read_link(format!("/proc/{pid}/exe")) {
            Ok(exe) => exe,
            Err(_) => continue,
        };
        if exe != Path::new(TRUSTED_CORE) && exe != Path::new(PACKAGED_CORE) {
            continue;
        }
        let meta = match fs::metadata(format!("/proc/{pid}")) {
            Ok(m) => m,
            Err(_) => continue,
        };
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            if meta.uid() != 0 {
                continue;
            }
        }
        unsafe {
            libc::kill(pid, libc::SIGTERM);
        }
    }
}

fn delete_iface_if_present(name: &str) {
    let _ = Command::new("ip")
        .args(["link", "delete", name])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}

fn resolve_kernel() -> Result<PathBuf, String> {
    for candidate in [TRUSTED_CORE, PACKAGED_CORE] {
        let path = Path::new(candidate);
        if !path.is_file() || path.is_symlink() {
            continue;
        }
        let meta = path.metadata().map_err(|e| e.to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            if meta.uid() != 0 {
                continue;
            }
            if meta.mode() & 0o022 != 0 {
                continue;
            }
        }
        if meta.permissions().mode() & 0o111 == 0 {
            continue;
        }
        return Ok(path.to_path_buf());
    }
    Err("trusted xray kernel is not installed".into())
}

pub(crate) fn resolve_config_for(requested: &Path, uid: u32) -> Result<PathBuf, String> {
    let home_dir = home_dir_for_uid(uid).ok_or("cannot resolve caller home")?;
    resolve_config_with_home(requested, uid, &home_dir)
}

pub(crate) fn resolve_config_with_home(
    requested: &Path,
    uid: u32,
    home_dir: &Path,
) -> Result<PathBuf, String> {
    if requested.is_symlink() {
        return Err("config path is not a regular canonical file".into());
    }
    let canonical = requested
        .canonicalize()
        .map_err(|_| "config path is not a regular canonical file".to_string())?;
    if !canonical.is_file() {
        return Err("config path is not a regular canonical file".into());
    }
    let allowed = [
        home_dir.join(".local/share/com.root.aurestream/xray-config.json"),
        home_dir.join(".config/com.root.aurestream/xray-config.json"),
        PathBuf::from(format!(
            "/run/user/{uid}/com.root.aurestream/xray-config.json"
        )),
    ];
    if !allowed.iter().any(|p| p == &canonical) {
        return Err("config path is outside AureStream app data".into());
    }
    let meta = canonical.metadata().map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if meta.uid() != uid {
            return Err("config file is not owned by the invoking user".into());
        }
    }
    Ok(canonical)
}

fn home_dir_for_uid(uid: u32) -> Option<PathBuf> {
    let out = Command::new("getent")
        .args(["passwd", &uid.to_string()])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let line = String::from_utf8_lossy(&out.stdout);
    let home = line.split(':').nth(5)?.trim();
    if home.is_empty() {
        None
    } else {
        Some(PathBuf::from(home))
    }
}

fn validate_caller(pid: u32, uid: u32) -> Result<String, String> {
    if pid <= 1 {
        return Err("caller pid is not owned by the invoking user".into());
    }
    let proc = PathBuf::from(format!("/proc/{pid}"));
    if !proc.is_dir() {
        return Err("caller pid is not owned by the invoking user".into());
    }
    let meta = proc.metadata().map_err(|_| {
        "caller pid is not owned by the invoking user".to_string()
    })?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if meta.uid() != uid {
            return Err("caller pid is not owned by the invoking user".into());
        }
    }
    caller_start_time(pid).ok_or_else(|| "caller pid is not owned by the invoking user".into())
}

fn caller_start_time(pid: u32) -> Option<String> {
    let stat = fs::read_to_string(format!("/proc/{pid}/stat")).ok()?;
    // Field 22 is starttime; comm may contain spaces inside parentheses.
    let rest = stat.rsplit_once(')')?.1;
    rest.split_whitespace().nth(19).map(|s| s.to_string())
}

fn caller_is_alive(pid: u32, uid: u32, expected_start: &str) -> bool {
    match caller_start_time(pid) {
        Some(start) if start == expected_start => {
            let proc = PathBuf::from(format!("/proc/{pid}"));
            let Ok(meta) = proc.metadata() else {
                return false;
            };
            #[cfg(unix)]
            {
                use std::os::unix::fs::MetadataExt;
                meta.uid() == uid
            }
            #[cfg(not(unix))]
            {
                let _ = (meta, uid);
                false
            }
        }
        _ => false,
    }
}

fn validate_iface(name: &str) -> bool {
    if name.is_empty() {
        return true;
    }
    name.chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | ':' | '-'))
        && !name.starts_with(['-', '.', ':'])
}

fn validate_dns(server: &str) -> bool {
    !server.is_empty()
        && server
            .chars()
            .all(|c| c.is_ascii_hexdigit() || matches!(c, '.' | ':'))
}

fn install_units() -> Result<(), String> {
    ensure_runtime_dir_world_traversable();
    fs::create_dir_all(SYSTEMD_DIR).map_err(|e| e.to_string())?;
    fs::write(SOCKET_UNIT_PATH, SOCKET_UNIT).map_err(|e| e.to_string())?;
    fs::write(SERVICE_UNIT_PATH, SERVICE_UNIT).map_err(|e| e.to_string())?;
    write_orphan_units()?;
    let _ = Command::new("systemctl").arg("daemon-reload").status();
    let _ = Command::new("systemctl")
        .args(["enable", "--now", "aurestream-tun.socket"])
        .status();
    let _ = Command::new("systemctl")
        .args(["enable", "--now", ORPHAN_TIMER_UNIT])
        .status();
    Ok(())
}

fn write_orphan_units() -> Result<(), String> {
    let service = format!(
        "[Unit]\nDescription=AureStream TUN helper orphan cleanup\nConditionPathExists={HELPER_DIR}/aurestream-tun-helper\n\n[Service]\nType=oneshot\nExecStart={HELPER_DIR}/aurestream-tun-helper orphan-check\n"
    );
    let timer = format!(
        "[Unit]\nDescription=Periodic AureStream TUN helper orphan check\n\n[Timer]\nOnBootSec=5min\nOnUnitActiveSec=30min\nPersistent=true\n\n[Install]\nWantedBy=timers.target\n"
    );
    fs::write(format!("{SYSTEMD_DIR}/{ORPHAN_SERVICE_UNIT}"), service)
        .map_err(|e| e.to_string())?;
    fs::write(format!("{SYSTEMD_DIR}/{ORPHAN_TIMER_UNIT}"), timer).map_err(|e| e.to_string())?;
    Ok(())
}

fn uninstall() -> Result<(), String> {
    teardown_all();
    let _ = Command::new("systemctl")
        .args(["disable", "--now", "aurestream-tun.socket"])
        .status();
    let _ = Command::new("systemctl")
        .args(["disable", "--now", "aurestream-tun.service"])
        .status();
    let _ = Command::new("systemctl")
        .args(["disable", "--now", ORPHAN_TIMER_UNIT])
        .status();
    let _ = fs::remove_file(SOCKET_UNIT_PATH);
    let _ = fs::remove_file(SERVICE_UNIT_PATH);
    let _ = fs::remove_file(format!("{SYSTEMD_DIR}/{ORPHAN_TIMER_UNIT}"));
    let _ = fs::remove_file(format!("{SYSTEMD_DIR}/{ORPHAN_SERVICE_UNIT}"));
    let _ = Command::new("systemctl").arg("daemon-reload").status();
    let _ = fs::remove_file("/usr/lib/AureStream/aurestream-tun-stop");
    let _ = fs::remove_file("/usr/share/polkit-1/actions/com.root.aurestream.policy");
    let _ = fs::remove_file("/etc/polkit-1/rules.d/49-aurestream.rules");
    let _ = fs::remove_dir_all(RUNTIME_DIR);
    Ok(())
}

fn orphan_check() -> Result<(), String> {
    if is_main_app_present() {
        println!("main app present — keep helper");
        return Ok(());
    }
    eprintln!("main app missing — uninstalling orphan helper");
    uninstall()
}

fn is_main_app_present() -> bool {
    if Command::new("pgrep")
        .args(["-x", "aurestream"])
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
    {
        return true;
    }
    for p in [
        "/usr/bin/aurestream",
        "/usr/bin/AureStream",
        "/opt/AureStream/aurestream",
        "/opt/AureStream/bin/aurestream",
        "/usr/lib/AureStream/aurestream",
        "/usr/share/applications/aurestream.desktop",
        "/usr/share/applications/AureStream.desktop",
    ] {
        if Path::new(p).exists() {
            return true;
        }
    }
    false
}

const SOCKET_UNIT: &str = r#"[Unit]
Description=AureStream TUN control socket

[Socket]
ListenStream=/run/aurestream-tun/app.sock
SocketMode=0666
DirectoryMode=0755
RemoveOnStop=true

[Install]
WantedBy=sockets.target
"#;

const SERVICE_UNIT: &str = r#"[Unit]
Description=AureStream TUN helper
Requires=aurestream-tun.socket
After=network-online.target aurestream-tun.socket

[Service]
Type=simple
ExecStartPre=-/bin/sh -c 'mkdir -p /run/aurestream-tun && chmod 755 /run/aurestream-tun'
ExecStart=/usr/lib/AureStream/aurestream-tun-helper serve
Restart=on-failure

[Install]
WantedBy=multi-user.target
"#;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_config_outside_allowlist() {
        let dir = tempfile::tempdir().unwrap();
        let home = dir.path();
        let outside = home.join("evil.json");
        fs::write(&outside, "{}").unwrap();
        let err = resolve_config_with_home(&outside, 1000, home).unwrap_err();
        assert!(err.contains("outside"), "{err}");
    }

    #[test]
    fn accepts_app_data_config_owned_by_caller() {
        let dir = tempfile::tempdir().unwrap();
        let home = dir.path();
        let cfg_dir = home.join(".local/share/com.root.aurestream");
        fs::create_dir_all(&cfg_dir).unwrap();
        let cfg = cfg_dir.join("xray-config.json");
        fs::write(&cfg, r#"{"inbounds":[]}"#).unwrap();
        let uid = unsafe { libc::getuid() };
        let resolved = resolve_config_with_home(&cfg, uid, home).unwrap();
        assert_eq!(resolved, cfg.canonicalize().unwrap());
    }

    #[test]
    fn rejects_symlink_config() {
        let dir = tempfile::tempdir().unwrap();
        let home = dir.path();
        let cfg_dir = home.join(".local/share/com.root.aurestream");
        fs::create_dir_all(&cfg_dir).unwrap();
        let real = dir.path().join("real.json");
        fs::write(&real, "{}").unwrap();
        let link = cfg_dir.join("xray-config.json");
        std::os::unix::fs::symlink(&real, &link).unwrap();
        let err = resolve_config_with_home(&link, unsafe { libc::getuid() }, home).unwrap_err();
        assert!(err.contains("canonical") || err.contains("outside"), "{err}");
    }

    #[test]
    fn validate_iface_and_dns() {
        assert!(validate_iface("ens160"));
        assert!(validate_iface("utun233"));
        assert!(!validate_iface("../etc"));
        assert!(validate_dns("1.1.1.1"));
        assert!(validate_dns("2001:db8::1"));
        assert!(!validate_dns("1.1.1.1;reboot"));
    }
}
