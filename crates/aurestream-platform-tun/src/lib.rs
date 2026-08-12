//! OS-level TUN capture (virtual NIC).
//!
//! - **Linux**: one `pkexec` session via `/usr/lib/AureStream/aurestream-tun-helper`
//!   (deb/rpm). Stop writes to a per-uid control FIFO (no signals to root; no
//!   second password). Fallback is passwordless `aurestream-tun-stop` via polkit.
//! - **Windows**: SCM service `AureStreamTunService` (`tun-service.exe`, one-time UAC).
//! - **macOS**: SMJobBless helper `com.root.aurestream.helper` (signed bundle).

use std::fmt;
use std::path::Path;

use serde::{Deserialize, Serialize};

mod config_patch;

/// Installation / readiness of the elevated TUN helper.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TunServiceState {
    NotInstalled,
    Ready,
    Running,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TunError {
    pub code: String,
    pub message: String,
}

impl TunError {
    pub fn not_installed(message: impl Into<String>) -> Self {
        Self {
            code: "tun_not_installed".into(),
            message: message.into(),
        }
    }

    pub fn failed(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }
}

impl fmt::Display for TunError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for TunError {}

/// Probe elevated TUN helper availability (no side effects).
pub fn probe() -> TunServiceState {
    #[cfg(target_os = "linux")]
    {
        return linux::probe();
    }
    #[cfg(target_os = "windows")]
    {
        return windows::probe();
    }
    #[cfg(target_os = "macos")]
    {
        return macos::probe();
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        TunServiceState::NotInstalled
    }
}

/// Ensure elevated helper/service is installed when possible.
///
/// - Linux: helper must already be on disk (deb/rpm / install script).
/// - Windows: may prompt UAC once to install/upgrade `tun-service`.
/// - macOS: may prompt once via SMJobBless to install privileged helper.
pub fn ensure_installed() -> Result<TunServiceState, TunError> {
    #[cfg(target_os = "windows")]
    {
        return windows::ensure_installed();
    }
    #[cfg(target_os = "macos")]
    {
        return macos::ensure_installed();
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let state = probe();
        match state {
            TunServiceState::Ready | TunServiceState::Running => Ok(state),
            TunServiceState::NotInstalled => Err(not_installed_error()),
        }
    }
}

/// Start TUN capture: elevated core + DNS hijack after readiness.
///
/// Caller must NOT also spawn a user-space core (`Engine::start`). After Ok,
/// mixed/API ports should accept connections.
///
/// `dns_hijack`: OS DNS override target (default `1.1.1.1`). Do not use the
/// TUN gateway IP — host DNS to `198.18.0.1:53` is refused.
/// `asset_dir`: geo assets (and on Windows, optionally `wintun.dll`).
pub fn start_tun(
    config_path: &Path,
    core_path: &Path,
    dns_hijack: Option<&str>,
    asset_dir: Option<&Path>,
) -> Result<(), TunError> {
    let dns = dns_hijack.unwrap_or("1.1.1.1");
    #[cfg(target_os = "linux")]
    {
        return linux::start_tun(config_path, core_path, dns, asset_dir);
    }
    #[cfg(target_os = "windows")]
    {
        return windows::start_tun(config_path, core_path, dns, asset_dir);
    }
    #[cfg(target_os = "macos")]
    {
        return macos::start_tun(config_path, core_path, dns, asset_dir);
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
    {
        let _ = (config_path, core_path, dns, asset_dir);
        Err(not_installed_error())
    }
}

/// Windows service binary entry helpers (used by `tun-service` bin).
#[cfg(target_os = "windows")]
pub fn windows_scm_ensure_installed(
    bundled: &Path,
    core: &Path,
    assets: Option<&Path>,
) -> Result<(), String> {
    windows::scm::ensure_installed(bundled, core, assets)
}

#[cfg(target_os = "windows")]
pub fn windows_scm_uninstall() -> Result<(), String> {
    windows::scm::uninstall()
}

/// Windows: orphan cleanup entry for scheduled task / CLI (`tun-service orphan-check`).
/// Returns `true` if the service was uninstalled because the main app is gone.
#[cfg(target_os = "windows")]
pub fn windows_orphan_check() -> bool {
    windows::scm::orphan_check_and_cleanup()
}

#[cfg(target_os = "windows")]
pub fn windows_service_run_dispatcher() -> i32 {
    windows::service::run_dispatcher()
}

/// Elevated uninstall of the Windows TUN SCM service (UAC).
#[cfg(target_os = "windows")]
pub fn windows_uninstall_service() -> Result<(), TunError> {
    let bundled = windows::resolve_tun_service_path()?;
    windows::elevate_uninstall(&bundled)
}

/// Uninstall the elevated TUN helper/service (best-effort stop first).
///
/// - **macOS**: SMJobBless helper via XPC (falls back to admin shell).
/// - **Windows**: elevated `tun-service uninstall` (UAC).
/// - **Linux**: `pkexec … uninstall` (polkit password; also used by deb postrm).
pub fn uninstall_elevated() -> Result<(), TunError> {
    let _ = stop_tun();
    #[cfg(target_os = "macos")]
    {
        return macos::uninstall_helper().map_err(|e| TunError::failed("helper_uninstall", e));
    }
    #[cfg(target_os = "windows")]
    {
        return windows_uninstall_service();
    }
    #[cfg(target_os = "linux")]
    {
        return linux::uninstall_helper();
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        Err(TunError::failed(
            "helper_uninstall",
            "当前平台没有可卸载的虚拟网卡组件。",
        ))
    }
}

/// Stop TUN capture and restore DNS (best-effort).
pub fn stop_tun() -> Result<(), TunError> {
    #[cfg(target_os = "linux")]
    {
        return linux::stop_tun();
    }
    #[cfg(target_os = "windows")]
    {
        return windows::stop_tun();
    }
    #[cfg(target_os = "macos")]
    {
        return macos::stop_tun();
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        Ok(())
    }
}

fn not_installed_error() -> TunError {
    #[cfg(target_os = "windows")]
    {
        TunError::not_installed(
            "虚拟网卡服务尚未安装。请使用带 TUN 组件的安装包，或暂时切换为系统代理。",
        )
    }
    #[cfg(target_os = "macos")]
    {
        TunError::not_installed(
            "macOS 虚拟网卡需要已签名安装包中的特权 Helper。当前环境不可用，请使用系统代理。",
        )
    }
    #[cfg(target_os = "linux")]
    {
        TunError::not_installed(
            "Linux 虚拟网卡需要 deb/rpm 安装的 polkit Helper（/usr/lib/AureStream/aurestream-tun-helper）。也可运行 scripts/install-linux-tun-helper.sh 安装开发用 helper。",
        )
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        TunError::not_installed("当前平台不支持虚拟网卡。")
    }
}

#[cfg(target_os = "linux")]
mod linux {
    use super::*;
    use std::fs::{self, OpenOptions};
    use std::io::{BufRead, BufReader, Read, Write};
    use std::path::{Path, PathBuf};
    use std::process::{Child, Command, Stdio};
    use std::sync::Mutex;
    use std::thread;
    use std::time::{Duration, Instant};

    pub const HELPER_PATH: &str = "/usr/lib/AureStream/aurestream-tun-helper";
    /// Separate polkit exec.path used only for stop-tun (allow_active=yes).
    pub const STOP_WRAPPER_PATH: &str = "/usr/lib/AureStream/aurestream-tun-stop";
    const RUNTIME_DIR: &str = "/run/aurestream-tun";
    const TRUSTED_CORE_PATHS: [&str; 2] = [
        "/usr/lib/AureStream/aurestream-core",
        "/usr/bin/aurestream-core",
    ];
    const TUN_GATEWAY_IP: &str = "198.18.0.1";
    /// Helper prints this single line after core API is up and DNS (if any) applied.
    const READY_TOKEN: &str = "aurestream-tun-ready";
    /// Include time for polkit password dialog + core boot + DNS.
    const READY_TIMEOUT: Duration = Duration::from_secs(60);
    /// How long to wait for the elevated helper to exit after a stop request.
    const STOP_WAIT: Duration = Duration::from_secs(8);

    static CHILD: Mutex<Option<Child>> = Mutex::new(None);

    pub fn probe() -> TunServiceState {
        if !helper_path().is_file()
            || !TRUSTED_CORE_PATHS
                .iter()
                .any(|path| Path::new(path).is_file())
        {
            return TunServiceState::NotInstalled;
        }
        if session_appears_running() {
            TunServiceState::Running
        } else {
            TunServiceState::Ready
        }
    }

    fn helper_path() -> PathBuf {
        if let Ok(p) = std::env::var("AURESTREAM_TUN_HELPER") {
            let path = PathBuf::from(p);
            if path.is_file() {
                return path;
            }
        }
        PathBuf::from(HELPER_PATH)
    }

    fn stop_wrapper_path() -> PathBuf {
        if let Ok(p) = std::env::var("AURESTREAM_TUN_STOP") {
            let path = PathBuf::from(p);
            if path.is_file() {
                return path;
            }
        }
        PathBuf::from(STOP_WRAPPER_PATH)
    }

    fn control_fifo_path() -> PathBuf {
        PathBuf::from(RUNTIME_DIR).join(format!("uid-{}", current_uid())).join("control")
    }

    fn current_uid() -> u32 {
        #[cfg(unix)]
        {
            return unsafe { libc::getuid() };
        }
        #[cfg(not(unix))]
        {
            0
        }
    }

    /// True when helper left a live session marker / core pid for this machine.
    fn session_appears_running() -> bool {
        let runtime = Path::new(RUNTIME_DIR);
        if !runtime.is_dir() {
            return false;
        }
        // Prefer per-uid marker for the current desktop user.
        let uid_core = runtime
            .join(format!("uid-{}", current_uid()))
            .join("core-pid");
        if pid_file_alive(&uid_core) {
            return true;
        }
        // Any session-* still present (e.g. after uid dir was partially cleared).
        if let Ok(entries) = fs::read_dir(runtime) {
            for entry in entries.flatten() {
                let name = entry.file_name();
                let name = name.to_string_lossy();
                if name.starts_with("session-") && entry.path().is_dir() {
                    let core = entry.path().join("core-pid");
                    if pid_file_alive(&core) {
                        return true;
                    }
                    // Session dir without a live core still means cleanup pending.
                    return true;
                }
            }
        }
        false
    }

    fn pid_file_alive(path: &Path) -> bool {
        let Ok(raw) = fs::read_to_string(path) else {
            return false;
        };
        let Ok(pid) = raw.trim().parse::<i32>() else {
            return false;
        };
        if pid <= 1 {
            return false;
        }
        #[cfg(unix)]
        {
            // kill(pid, 0) works across uids for existence check on Linux.
            return unsafe { libc::kill(pid, 0) } == 0;
        }
        #[cfg(not(unix))]
        {
            let _ = pid;
            false
        }
    }

    pub fn start_tun(
        config_path: &Path,
        core_path: &Path,
        dns_hijack: &str,
        asset_dir: Option<&Path>,
    ) -> Result<(), TunError> {
        let helper = helper_path();
        if !helper.is_file() {
            return Err(super::not_installed_error());
        }

        // Best-effort stop of any prior session (FIFO / passwordless stop wrapper).
        // Fresh start-tun also tears down leftovers inside the same elevation.
        let _ = stop_tun_inner(/*allow_missing=*/ true);

        let config = config_path
            .to_str()
            .ok_or_else(|| TunError::failed("bad_path", "config path is not UTF-8"))?;
        // The elevated helper resolves this fixed kernel id to a root-owned
        // executable. Never pass a caller-controlled executable path to it.
        let _ = (core_path, asset_dir);

        // Bind proxy dials to the physical NIC (same loop risk as macOS/Windows).
        match detect_active_iface() {
            Ok(iface) => {
                match super::config_patch::patch_tun_config_outbounds_interface(config, &iface) {
                    Ok(true) => log::info!("[tun/linux] patched outbound interface -> {iface}"),
                    Ok(false) => log::debug!("[tun/linux] outbound interface already {iface}"),
                    Err(e) => {
                        return Err(TunError::failed(
                            "tun_route_patch",
                            format!("准备代理节点绕行路由失败: {e}"),
                        ));
                    }
                }
            }
            Err(e) => {
                return Err(TunError::failed(
                    "tun_outbound_interface",
                    format!("无法确定代理流量的物理出口网卡: {e}"),
                ));
            }
        }

        // Capture original DNS before starting (helper restores on stop).
        let dns_info = match prepare_dns_capture() {
            Ok(info) => {
                log::info!(
                    "[tun/linux] captured DNS iface={} original={}",
                    info.0,
                    info.1
                );
                Some(info)
            }
            Err(e) => {
                log::warn!("[tun/linux] DNS capture failed (continuing without hijack): {e}");
                None
            }
        };

        let api_port = parse_api_port_from_config(config_path).unwrap_or(10809);
        let gateway = dns_hijack_or_gateway(dns_hijack);
        let caller_pid = std::process::id().to_string();

        log::info!(
            "[tun/linux] pkexec start-tun helper={} kernel=xray config={} api={} dns={}",
            helper.display(),
            config,
            api_port,
            gateway
        );

        // Single elevated session: cleanup + core + wait API + DNS + control FIFO.
        let mut cmd = Command::new("pkexec");
        cmd.arg(helper.as_os_str())
            .arg("start-tun")
            .arg("xray")
            .arg(config)
            .arg(&caller_pid)
            .arg(api_port.to_string())
            .arg(&gateway);
        if let Some((iface, original)) = dns_info.as_ref() {
            cmd.arg(iface).args(original.split_whitespace());
        }
        let mut child = cmd
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| {
                TunError::failed(
                    "pkexec_spawn",
                    format!("无法启动 pkexec（是否安装 policykit？）: {e}"),
                )
            })?;

        // Wait for helper ready token (core API up + DNS applied in-process).
        match wait_helper_ready(&mut child) {
            Ok(()) => {}
            Err(e) => {
                let detail = drain_child_output(&mut child);
                // Ask helper to exit via FIFO if it got that far; never hang on kill.
                let _ = request_stop_via_fifo();
                reap_child_with_timeout(&mut child, Duration::from_secs(3));
                let msg = if detail.is_empty() {
                    e.message
                } else {
                    format!("{}: {}", e.message, detail)
                };
                return Err(TunError::failed(e.code, msg));
            }
        }

        // Keep draining pipes so a chatty helper cannot block on full buffers.
        attach_log_drains(&mut child);

        *CHILD.lock().unwrap_or_else(|e| e.into_inner()) = Some(child);
        Ok(())
    }

    /// pkexec uninstall of helper + polkit files (may prompt password).
    /// Caller should stop TUN first (`uninstall_elevated` already does).
    pub fn uninstall_helper() -> Result<(), TunError> {
        let helper = helper_path();
        if !helper.is_file() {
            log::info!("[tun/linux] helper not installed, nothing to uninstall");
            return Ok(());
        }
        log::info!("[tun/linux] pkexec uninstall {}", helper.display());
        let output = Command::new("pkexec")
            .arg(helper.as_os_str())
            .arg("uninstall")
            .output()
            .map_err(|e| {
                TunError::failed("helper_uninstall", format!("pkexec spawn failed: {e}"))
            })?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            return Err(TunError::failed(
                "helper_uninstall",
                format!(
                    "卸载虚拟网卡 Helper 失败（需授权）: {}{}",
                    stderr.trim(),
                    stdout.trim()
                ),
            ));
        }
        Ok(())
    }

    pub fn stop_tun() -> Result<(), TunError> {
        stop_tun_inner(/*allow_missing=*/ false)
    }

    fn stop_tun_inner(allow_missing: bool) -> Result<(), TunError> {
        let had_child = CHILD.lock().unwrap_or_else(|e| e.into_inner()).is_some();
        let session_before = session_appears_running();
        if !had_child && !session_before {
            if allow_missing {
                return Ok(());
            }
            // Nothing to stop — idempotent success (UI disconnect / already idle).
            return Ok(());
        }

        // Primary path: write "stop" to the helper control FIFO. The elevated
        // process exits on its own (DNS restore + core kill). Unprivileged apps
        // cannot signal root children — never rely on kill/SIGTERM here.
        let fifo_sent = request_stop_via_fifo();
        if fifo_sent {
            log::info!("[tun/linux] stop requested via control FIFO");
        } else {
            log::info!("[tun/linux] control FIFO not available; will use stop wrapper fallback");
        }

        // Reap local child handle with a hard timeout (no kill, no infinite wait).
        if let Some(mut child) = CHILD.lock().unwrap_or_else(|e| e.into_inner()).take() {
            if reap_child_with_timeout(&mut child, STOP_WAIT) {
                log::info!("[tun/linux] elevated session exited after stop request");
            } else {
                log::warn!(
                    "[tun/linux] elevated session still running after {}s; falling back",
                    STOP_WAIT.as_secs()
                );
                // Detach: spawn a short reaper so we do not leak a zombie forever,
                // but never block the UI thread on a root process we cannot kill.
                thread::spawn(move || {
                    let _ = reap_child_with_timeout(&mut child, Duration::from_secs(30));
                });
            }
        } else if fifo_sent {
            // No child handle (e.g. after partial restart) — wait for markers to clear.
            wait_session_gone(STOP_WAIT);
        }

        if !session_appears_running() {
            return Ok(());
        }

        // Fallback: passwordless polkit stop wrapper (or main helper if wrapper missing).
        pkexec_stop_fallback()?;

        if session_appears_running() {
            return Err(TunError::failed(
                "tun_stop_incomplete",
                "虚拟网卡未能完全关闭（内核或 DNS 会话仍在）。请重试断开，或重新安装 TUN Helper。",
            ));
        }
        Ok(())
    }

    /// Write stop to the per-uid control FIFO. Returns true if the write opened.
    fn request_stop_via_fifo() -> bool {
        let path = control_fifo_path();
        if !path.exists() {
            return false;
        }
        // Opening a FIFO for write blocks until a reader is present. The helper
        // loops on `timeout 1 cat`, so a reader appears within ~1s while healthy.
        // Run the open+write on a worker with a hard deadline so a dead helper
        // cannot hang the UI stop path forever.
        let (tx, rx) = std::sync::mpsc::channel();
        let path_clone = path.clone();
        thread::spawn(move || {
            let result = (|| -> std::io::Result<()> {
                let mut f = OpenOptions::new().write(true).open(&path_clone)?;
                f.write_all(b"stop\n")?;
                f.flush()?;
                Ok(())
            })();
            let _ = tx.send(result);
        });
        match rx.recv_timeout(Duration::from_secs(3)) {
            Ok(Ok(())) => true,
            Ok(Err(e)) => {
                log::warn!(
                    "[tun/linux] control FIFO write failed ({}): {e}",
                    path.display()
                );
                false
            }
            Err(_) => {
                log::warn!(
                    "[tun/linux] control FIFO open timed out ({})",
                    path.display()
                );
                false
            }
        }
    }

    fn wait_session_gone(limit: Duration) {
        let deadline = Instant::now() + limit;
        while Instant::now() < deadline {
            if !session_appears_running() {
                return;
            }
            thread::sleep(Duration::from_millis(100));
        }
    }

    /// Wait up to `limit` for the child to exit. Never calls kill (EPERM on root).
    /// Returns true if the process exited.
    fn reap_child_with_timeout(child: &mut Child, limit: Duration) -> bool {
        let deadline = Instant::now() + limit;
        loop {
            match child.try_wait() {
                Ok(Some(status)) => {
                    log::debug!("[tun/linux] child reaped status={status}");
                    return true;
                }
                Ok(None) if Instant::now() < deadline => {
                    thread::sleep(Duration::from_millis(50));
                }
                Ok(None) | Err(_) => return false,
            }
        }
    }

    fn pkexec_stop_fallback() -> Result<(), TunError> {
        let wrapper = stop_wrapper_path();
        let helper = helper_path();
        let (bin, args): (PathBuf, Vec<&str>) = if wrapper.is_file() {
            // stop wrapper's only argv is consumed by the script itself; pkexec runs it.
            (wrapper, vec![])
        } else if helper.is_file() {
            (helper, vec!["stop-tun"])
        } else {
            // No helper installed and no session markers left → treat as stopped.
            return Ok(());
        };

        log::info!(
            "[tun/linux] pkexec stop fallback bin={} args={args:?}",
            bin.display()
        );
        let mut cmd = Command::new("pkexec");
        cmd.arg(bin.as_os_str());
        for a in &args {
            cmd.arg(a);
        }
        let out = cmd.output().map_err(|e| {
            TunError::failed("pkexec_stop", format!("pkexec stop failed: {e}"))
        })?;
        if !out.status.success() {
            let stderr = String::from_utf8_lossy(&out.stderr);
            let stdout = String::from_utf8_lossy(&out.stdout);
            return Err(TunError::failed(
                "pkexec_stop",
                format!(
                    "停止虚拟网卡失败: {}{}",
                    stderr.trim(),
                    stdout.trim()
                ),
            ));
        }
        // Give helper a moment to finish DNS restore after teardown returns.
        wait_session_gone(Duration::from_secs(2));
        Ok(())
    }

    fn dns_hijack_or_gateway(dns_hijack: &str) -> String {
        // Prefer an explicit hijack target. Empty → public resolver (routed via TUN).
        if dns_hijack.is_empty() {
            "1.1.1.1".into()
        } else {
            dns_hijack.to_string()
        }
    }

    /// Block until helper prints READY_TOKEN, or the elevated process exits / times out.
    ///
    /// Reading runs on a helper thread so READY_TIMEOUT is enforced even when
    /// `read_line` would otherwise block indefinitely.
    fn wait_helper_ready(child: &mut Child) -> Result<(), TunError> {
        use std::process::ChildStdout;
        use std::sync::mpsc;

        enum ReadyMsg {
            Ready(ChildStdout),
            Eof(ChildStdout),
            Io(std::io::Error, ChildStdout),
        }

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| TunError::failed("tun_start", "missing helper stdout pipe"))?;
        let (tx, rx) = mpsc::channel::<ReadyMsg>();
        thread::spawn(move || {
            let mut reader = BufReader::new(stdout);
            let mut line = String::new();
            loop {
                line.clear();
                match reader.read_line(&mut line) {
                    Ok(0) => {
                        let _ = tx.send(ReadyMsg::Eof(reader.into_inner()));
                        return;
                    }
                    Ok(_) => {
                        let token = line.trim();
                        if token == READY_TOKEN {
                            let _ = tx.send(ReadyMsg::Ready(reader.into_inner()));
                            return;
                        }
                        if !token.is_empty() {
                            log::debug!("[tun/helper stdout] {token}");
                        }
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
                    Err(e) => {
                        let _ = tx.send(ReadyMsg::Io(e, reader.into_inner()));
                        return;
                    }
                }
            }
        });

        let deadline = Instant::now() + READY_TIMEOUT;
        loop {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                return Err(TunError::failed(
                    "tun_start_timeout",
                    "虚拟网卡启动超时（未收到 helper 就绪信号）",
                ));
            }

            match rx.recv_timeout(remaining.min(Duration::from_millis(200))) {
                Ok(ReadyMsg::Ready(stdout)) => {
                    child.stdout = Some(stdout);
                    log::info!("[tun/linux] helper ready ({READY_TOKEN})");
                    return Ok(());
                }
                Ok(ReadyMsg::Eof(stdout)) => {
                    child.stdout = Some(stdout);
                    if let Some(status) = child.try_wait().ok().flatten() {
                        return Err(TunError::failed(
                            "tun_core_exited",
                            format!("虚拟网卡内核提前退出 (status={status})"),
                        ));
                    }
                    return Err(TunError::failed(
                        "tun_start",
                        "虚拟网卡 helper 在就绪前关闭了输出",
                    ));
                }
                Ok(ReadyMsg::Io(e, stdout)) => {
                    child.stdout = Some(stdout);
                    return Err(TunError::failed(
                        "tun_start",
                        format!("读取 helper 输出失败: {e}"),
                    ));
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    if let Some(status) = child.try_wait().ok().flatten() {
                        // Process died; wait briefly for the reader thread to finish.
                        match rx.recv_timeout(Duration::from_millis(300)) {
                            Ok(ReadyMsg::Ready(stdout)) => {
                                child.stdout = Some(stdout);
                                return Ok(());
                            }
                            Ok(ReadyMsg::Eof(stdout)) | Ok(ReadyMsg::Io(_, stdout)) => {
                                child.stdout = Some(stdout);
                            }
                            Err(_) => {}
                        }
                        return Err(TunError::failed(
                            "tun_core_exited",
                            format!("虚拟网卡内核提前退出 (status={status})"),
                        ));
                    }
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    return Err(TunError::failed(
                        "tun_start",
                        "虚拟网卡 helper 就绪等待通道已断开",
                    ));
                }
            }
        }
    }

    fn attach_log_drains(child: &mut Child) {
        if let Some(mut out) = child.stdout.take() {
            thread::spawn(move || {
                let mut buf = [0u8; 4096];
                loop {
                    match out.read(&mut buf) {
                        Ok(0) | Err(_) => break,
                        Ok(n) => {
                            let line = String::from_utf8_lossy(&buf[..n]);
                            for l in line.lines() {
                                if !l.trim().is_empty() {
                                    log::debug!("[tun/core stdout] {l}");
                                }
                            }
                        }
                    }
                }
            });
        }
        if let Some(mut err) = child.stderr.take() {
            thread::spawn(move || {
                let mut buf = [0u8; 4096];
                loop {
                    match err.read(&mut buf) {
                        Ok(0) | Err(_) => break,
                        Ok(n) => {
                            let line = String::from_utf8_lossy(&buf[..n]);
                            for l in line.lines() {
                                if !l.trim().is_empty() {
                                    log::debug!("[tun/core stderr] {l}");
                                }
                            }
                        }
                    }
                }
            });
        }
    }

    fn prepare_dns_capture() -> Result<(String, String), String> {
        let iface = detect_active_iface()?;
        let original = capture_original_dns(&iface)?;
        Ok((iface, original))
    }

    fn detect_active_iface() -> Result<String, String> {
        let out = Command::new("sh")
            .arg("-c")
            .arg(
                "ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i==\"dev\") print $(i+1)}' | head -1",
            )
            .output()
            .map_err(|e| format!("ip route get failed: {e}"))?;
        let iface = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if iface.is_empty() {
            Err("no default interface".into())
        } else {
            Ok(iface)
        }
    }

    fn capture_original_dns(iface: &str) -> Result<String, String> {
        // 1. nmcli
        if let Ok(out) = Command::new("nmcli")
            .args(["-t", "-f", "IP4.DNS", "dev", "show", iface])
            .output()
        {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let servers: Vec<&str> = stdout
                .lines()
                .filter_map(|l| l.split(':').nth(1))
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .collect();
            if !servers.is_empty() {
                return Ok(servers.join(" "));
            }
        }

        // 2. resolvectl
        if let Ok(out) = Command::new("resolvectl").args(["status", iface]).output() {
            let stdout = String::from_utf8_lossy(&out.stdout);
            for line in stdout.lines() {
                let line = line.trim();
                if line.starts_with("DNS Servers:") || line.starts_with("Current DNS Server:") {
                    if let Some(servers) = line.split(':').nth(1) {
                        let s = servers.trim();
                        if !s.is_empty() {
                            return Ok(s.to_string());
                        }
                    }
                }
            }
        }

        // 3. /etc/resolv.conf
        let contents = std::fs::read_to_string("/etc/resolv.conf")
            .map_err(|e| format!("read resolv.conf: {e}"))?;
        let nameservers: Vec<&str> = contents
            .lines()
            .filter_map(|line| {
                let trimmed = line.trim();
                trimmed.strip_prefix("nameserver").map(|s| s.trim())
            })
            .filter(|s| !s.is_empty() && *s != TUN_GATEWAY_IP)
            .collect();
        if !nameservers.is_empty() {
            return Ok(nameservers.join(" "));
        }

        Err(format!("could not determine original DNS for {iface}"))
    }

    fn drain_child_output(child: &mut Child) -> String {
        let mut buf = String::new();
        if let Some(mut out) = child.stdout.take() {
            let mut s = String::new();
            let _ = out.read_to_string(&mut s);
            buf.push_str(&s);
        }
        if let Some(mut err) = child.stderr.take() {
            let mut s = String::new();
            let _ = err.read_to_string(&mut s);
            if !buf.is_empty() && !s.is_empty() {
                buf.push('\n');
            }
            buf.push_str(&s);
        }
        // Keep last lines only.
        let lines: Vec<&str> = buf.lines().rev().take(12).collect();
        lines.into_iter().rev().collect::<Vec<_>>().join(" | ")
    }

    fn parse_api_port_from_config(path: &Path) -> Option<u16> {
        let raw = std::fs::read_to_string(path).ok()?;
        // crude scan for "tag": "api" nearby port
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw) {
            if let Some(arr) = v.get("inbounds")?.as_array() {
                for ib in arr {
                    if ib.get("tag").and_then(|t| t.as_str()) == Some("api") {
                        return ib.get("port").and_then(|p| p.as_u64()).map(|p| p as u16);
                    }
                }
            }
        }
        None
    }
}

#[cfg(target_os = "windows")]
mod windows;

#[cfg(target_os = "macos")]
mod macos;
