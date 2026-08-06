//! OS-level TUN capture (virtual NIC).
//!
//! Linux: pkexec + `/usr/lib/AureStream/aurestream-tun-helper` (deb/rpm).
//! Windows / macOS: probe stubs until Phase 1–2 helper ports land.

use std::fmt;
use std::path::Path;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

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

/// Saved DNS restore info for the active TUN session (Linux).
static DNS_RESTORE: Mutex<Option<(String, String)>> = Mutex::new(None);

fn set_dns_restore(info: Option<(String, String)>) {
    *DNS_RESTORE.lock().unwrap_or_else(|e| e.into_inner()) = info;
}

fn take_dns_restore() -> Option<(String, String)> {
    DNS_RESTORE
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .take()
}

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

/// Ensure helper is installed when possible.
pub fn ensure_installed() -> Result<TunServiceState, TunError> {
    let state = probe();
    match state {
        TunServiceState::Ready | TunServiceState::Running => Ok(state),
        TunServiceState::NotInstalled => Err(not_installed_error()),
    }
}

/// Start TUN capture: elevated core + (Linux) DNS hijack after readiness.
///
/// On Linux the helper `exec`s Xray as root via pkexec. Caller must NOT also
/// spawn a user-space core. After this returns Ok, mixed/API ports should be
/// ready for probing.
///
/// `dns_hijack`: OS DNS override target. Linux/macOS typically use the TUN
/// gateway (`198.18.0.1`); Windows uses a public resolver.
/// `asset_dir`: directory with `geoip.dat` / `geosite.dat` (exported as
/// `XRAY_LOCATION_ASSET` for the elevated core).
pub fn start_tun(
    config_path: &Path,
    core_path: &Path,
    dns_hijack: Option<&str>,
    asset_dir: Option<&Path>,
) -> Result<(), TunError> {
    #[cfg(target_os = "linux")]
    {
        // Linux: hijack system DNS to a public resolver that is routed into the
        // TUN (same idea as Windows). Xray does not accept host DNS on the TUN
        // gateway IP itself (198.18.0.1:53 → connection refused); queries to
        // 1.1.1.1 enter utun233 via autoSystemRoutingTable and are handled.
        return linux::start_tun(
            config_path,
            core_path,
            dns_hijack.unwrap_or("1.1.1.1"),
            asset_dir,
        );
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = (config_path, core_path, dns_hijack, asset_dir);
        Err(not_installed_error())
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
    use std::io::Read;
    use std::net::TcpStream;
    use std::path::Path;
    use std::process::{Child, Command, Stdio};
    use std::sync::Mutex;
    use std::thread;
    use std::time::{Duration, Instant};

    pub const HELPER_PATH: &str = "/usr/lib/AureStream/aurestream-tun-helper";
    const TUN_GATEWAY_IP: &str = "198.18.0.1";
    /// Include time for polkit password dialog + core boot.
    const READY_TIMEOUT: Duration = Duration::from_secs(60);
    const POLL: Duration = Duration::from_millis(150);

    static CHILD: Mutex<Option<Child>> = Mutex::new(None);

    pub fn probe() -> TunServiceState {
        if helper_path().is_file() {
            TunServiceState::Ready
        } else {
            TunServiceState::NotInstalled
        }
    }

    fn helper_path() -> std::path::PathBuf {
        if let Ok(p) = std::env::var("AURESTREAM_TUN_HELPER") {
            let path = std::path::PathBuf::from(p);
            if path.is_file() {
                return path;
            }
        }
        std::path::PathBuf::from(HELPER_PATH)
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

        // Tear down any previous elevated session first.
        let _ = stop_tun();

        let config = config_path
            .to_str()
            .ok_or_else(|| TunError::failed("bad_path", "config path is not UTF-8"))?;
        let core = core_path
            .to_str()
            .ok_or_else(|| TunError::failed("bad_path", "core path is not UTF-8"))?;
        let assets = asset_dir
            .and_then(|p| p.to_str().map(|s| s.to_string()))
            .filter(|s| !s.is_empty());

        // Capture original DNS before starting (restore on stop).
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

        log::info!(
            "[tun/linux] pkexec start-tun helper={} core={} config={} assets={}",
            helper.display(),
            core,
            config,
            assets.as_deref().unwrap_or("<none>")
        );

        let mut cmd = Command::new("pkexec");
        cmd.arg(helper.as_os_str())
            .arg("start-tun")
            .arg(core)
            .arg(config);
        if let Some(ref a) = assets {
            cmd.arg(a);
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

        // Wait until Xray API is accepting connections (core ready).
        if !wait_port_ready(api_port, &mut child)? {
            let detail = drain_child_output(&mut child);
            let _ = child.kill();
            let _ = child.wait();
            // Best-effort: elevated pkill if pkexec already handed off.
            let _ = Command::new("pkexec")
                .arg(helper.as_os_str())
                .arg("stop-tun")
                .output();
            return Err(TunError::failed(
                "tun_start_timeout",
                format!(
                    "虚拟网卡内核启动超时（API :{api_port} 未就绪）{}",
                    if detail.is_empty() {
                        String::new()
                    } else {
                        format!(": {detail}")
                    }
                ),
            ));
        }

        // Keep draining pipes so a chatty core cannot block on full buffers.
        attach_log_drains(&mut child);

        // Apply DNS hijack AFTER core is ready (plan improvement over legacy).
        if let Some((ref iface, ref original)) = dns_info {
            let gateway = dns_hijack_or_gateway(dns_hijack);
            if let Err(e) = apply_dns_override(iface, &gateway) {
                log::warn!("[tun/linux] dns-override failed: {e}");
            } else {
                log::info!("[tun/linux] DNS override iface={iface} -> {gateway}");
                set_dns_restore(Some((iface.clone(), original.clone())));
            }
        }

        *CHILD.lock().unwrap_or_else(|e| e.into_inner()) = Some(child);
        Ok(())
    }

    pub fn stop_tun() -> Result<(), TunError> {
        let dns = take_dns_restore();
        let helper = helper_path();

        // Prefer helper stop (restores DNS + kills core as root).
        if helper.is_file() {
            let mut args: Vec<String> = vec![
                helper.display().to_string(),
                "stop-tun".into(),
            ];
            if let Some((iface, original)) = dns.as_ref() {
                args.push(iface.clone());
                for s in original.split_whitespace() {
                    args.push(s.to_string());
                }
            }
            log::info!("[tun/linux] pkexec stop-tun args={args:?}");
            let out = Command::new("pkexec")
                .args(&args)
                .output()
                .map_err(|e| TunError::failed("pkexec_stop", format!("pkexec stop failed: {e}")))?;
            if !out.status.success() {
                let stderr = String::from_utf8_lossy(&out.stderr);
                log::warn!("[tun/linux] stop-tun non-zero: {}", stderr.trim());
            }
        } else if let Some((iface, original)) = dns.as_ref() {
            // Best-effort user-space restore if helper vanished.
            let _ = Command::new("resolvectl")
                .arg("dns")
                .arg(iface)
                .args(original.split_whitespace())
                .status();
        }

        // Drop local child handle (pkexec may already have exited with core).
        if let Some(mut child) = CHILD.lock().unwrap_or_else(|e| e.into_inner()).take() {
            let _ = child.kill();
            let _ = child.wait();
        }

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

    fn apply_dns_override(iface: &str, gateway: &str) -> Result<(), TunError> {
        let helper = helper_path();
        let out = Command::new("pkexec")
            .arg(helper.as_os_str())
            .arg("dns-override")
            .arg(iface)
            .arg(gateway)
            .output()
            .map_err(|e| TunError::failed("pkexec_dns", format!("dns-override spawn: {e}")))?;
        if !out.status.success() {
            let stderr = String::from_utf8_lossy(&out.stderr);
            return Err(TunError::failed(
                "dns_override",
                format!("dns-override failed: {}", stderr.trim()),
            ));
        }
        Ok(())
    }

    fn wait_port_ready(api_port: u16, child: &mut Child) -> Result<bool, TunError> {
        let deadline = Instant::now() + READY_TIMEOUT;
        while Instant::now() < deadline {
            if let Some(status) = child.try_wait().ok().flatten() {
                let detail = drain_child_output(child);
                return Err(TunError::failed(
                    "tun_core_exited",
                    format!(
                        "虚拟网卡内核提前退出 (status={status}){}",
                        if detail.is_empty() {
                            String::new()
                        } else {
                            format!(": {detail}")
                        }
                    ),
                ));
            }
            if TcpStream::connect_timeout(
                &([127, 0, 0, 1], api_port).into(),
                Duration::from_millis(80),
            )
            .is_ok()
            {
                return Ok(true);
            }
            thread::sleep(POLL);
        }
        Ok(false)
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
mod windows {
    use super::*;

    pub fn probe() -> TunServiceState {
        TunServiceState::NotInstalled
    }

    pub fn stop_tun() -> Result<(), TunError> {
        Ok(())
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use super::*;

    pub fn probe() -> TunServiceState {
        TunServiceState::NotInstalled
    }

    pub fn stop_tun() -> Result<(), TunError> {
        Ok(())
    }
}
