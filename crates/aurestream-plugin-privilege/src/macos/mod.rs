pub mod helper;

const BLESSED_HELPER_PATH: &str = "/Library/PrivilegedHelperTools/com.root.aurestream.helper";
const BLESSED_PLIST_PATH: &str = "/Library/LaunchDaemons/com.root.aurestream.helper.plist";
const BLESSED_HELPER_LABEL: &str = "com.root.aurestream.helper";

fn is_blessed_helper_on_disk() -> bool {
    std::path::Path::new(BLESSED_HELPER_PATH).exists()
        || std::path::Path::new(BLESSED_PLIST_PATH).exists()
}

fn launchctl_print_disabled_marks_helper_disabled(output: &str) -> bool {
    output.lines().any(|line| {
        line.contains(BLESSED_HELPER_LABEL) && line.contains("=>") && line.contains("disabled")
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_disabled_helper_from_launchctl_output() {
        let output = r#"
disabled services = {
        "com.apple.something" => enabled
        "com.root.aurestream.helper" => disabled
}
"#;

        assert!(launchctl_print_disabled_marks_helper_disabled(output));
    }

    #[test]
    fn ignores_enabled_helper_from_launchctl_output() {
        let output = r#"
disabled services = {
        "com.root.aurestream.helper" => enabled
}
"#;

        assert!(!launchctl_print_disabled_marks_helper_disabled(output));
    }
}

pub fn probe_helper() -> Result<String, String> {
    match helper::api::ping() {
        Ok(msg) => Ok(msg),
        Err(e) => {
            if is_blessed_helper_on_disk() {
                log::warn!("[helper] blessed files present but XPC ping failed: {}", e);
                Ok(format!("installed_unreachable: {e}"))
            } else {
                Err(e)
            }
        }
    }
}

fn force_remove_blessed_helper_via_admin() -> Result<(), String> {
    use std::process::Command;

    let shell = format!(
        "launchctl bootout system/{BLESSED_HELPER_LABEL} 2>/dev/null; \
         rm -f {BLESSED_PLIST_PATH} {BLESSED_HELPER_PATH}"
    );
    let script = format!("do shell script \"{shell}\" with administrator privileges");

    log::info!("[mac] removing blessed helper via admin shell (XPC unavailable)");
    let output = Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .output()
        .map_err(|e| format!("osascript spawn failed: {e}"))?;

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    Err(format!(
        "admin uninstall failed (exit {}): {}{}",
        output.status.code().unwrap_or(-1),
        stderr,
        stdout
    ))
}

fn is_helper_disabled_in_launchd() -> bool {
    let output = std::process::Command::new("launchctl")
        .args(["print-disabled", "system"])
        .output();

    let Ok(output) = output else {
        return false;
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    launchctl_print_disabled_marks_helper_disabled(&stdout)
}

/// Clear a persistent launchd disabled override and (re)start the helper.
/// Requires root, so this prompts for an admin password via osascript.
fn repair_disabled_helper_via_admin() -> Result<(), String> {
    use std::process::Command;

    let shell = format!(
        "launchctl enable system/{BLESSED_HELPER_LABEL}; \
         launchctl bootstrap system {BLESSED_PLIST_PATH} 2>/dev/null || true; \
         launchctl kickstart -k system/{BLESSED_HELPER_LABEL} 2>/dev/null || true"
    );
    let script = format!("do shell script \"{shell}\" with administrator privileges");

    log::info!("[mac] clearing disabled override + starting helper via admin shell");
    let output = Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .output()
        .map_err(|e| format!("osascript spawn failed: {e}"))?;

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    Err(format!(
        "admin helper repair failed (exit {}): {}{}",
        output.status.code().unwrap_or(-1),
        stderr,
        stdout
    ))
}

fn install_helper_and_repair_disabled_state() -> Result<(), String> {
    helper::api::install().map_err(format_helper_install_error)?;

    // Normal path: SMJobBless enables + bootstraps the daemon, so a few ping
    // retries are all that's needed — one password total.
    for attempt in 1..=12 {
        std::thread::sleep(std::time::Duration::from_millis(500));
        if helper::api::ping().is_ok() {
            return Ok(());
        }
        log::info!("[helper] post-install ping attempt {}/12 failed", attempt);
    }

    // Last-resort recovery: only when launchd holds a PERSISTENT disabled
    // override (left by an older uninstall that ran `launchctl disable` /
    // `unload -w`). Clearing it requires root, so this prompts once more. This
    // does NOT fire for clean installs, so the common case stays single-prompt.
    if is_helper_disabled_in_launchd() {
        log::warn!("[helper] daemon persistently disabled in launchd; clearing override (admin)");
        repair_disabled_helper_via_admin()?;
        for _ in 0..8 {
            std::thread::sleep(std::time::Duration::from_millis(500));
            if helper::api::ping().is_ok() {
                return Ok(());
            }
        }
    }

    Err(
        "Helper 已安装但暂时无响应。请退出并重新打开应用；若仍失败，请先在设置中卸载辅助服务后重装。"
            .to_string(),
    )
}

pub fn uninstall_privileged_helper() -> Result<(), String> {
    if !is_blessed_helper_on_disk() {
        log::info!("[mac] privileged helper not installed, nothing to uninstall");
        return Ok(());
    }

    log::info!("[mac] stopping helper-managed sing-box before uninstall");
    let _ = helper::api::stop_sing_box();

    log::info!("[mac] uninstalling privileged helper via XPC");
    if helper::api::uninstall().is_ok() {
        log::info!("[mac] privileged helper uninstall completed (XPC)");
        return Ok(());
    }

    log::warn!("[mac] XPC uninstall failed; falling back to admin shell removal");
    force_remove_blessed_helper_via_admin()?;
    log::info!("[mac] privileged helper uninstall completed (admin shell)");
    Ok(())
}

fn format_helper_install_error(err: String) -> String {
    if err.contains("CFErrorDomainLaunchd error 4") {
        return format!(
            "{err}\n\n\
             常见原因：主程序与特权 Helper 的代码签名要求不一致（SMJobBless error 4）。\n\
             请尝试：\n\
             1. 对完整 .app 执行：pnpm sign-macos-bundle /path/to/aurestream.app\n\
             2. 设置页卸载辅助服务后重新安装\n\
             3. 勿使用 tauri dev 测试 TUN；请用 release 安装包\n\
             4. Developer ID 发布需运行 sync-smjobbless-reqs 并重新 pre-bundle/build"
        );
    }
    err
}

pub fn ensure_helper_installed() -> Result<(), String> {
    let bundled_path = bundled_helper_path().ok_or_else(|| {
        "应用包内未找到特权辅助工具（Contents/Library/LaunchServices/com.root.aurestream.helper）。请使用完整安装包重新安装。".to_string()
    })?;
    log::debug!("[helper] bundled helper path: {:?}", bundled_path);

    // Check version first — if an upgrade is needed, SMJobBless handles both
    // install and upgrade in one authorization, avoiding a double password prompt.
    let bundled_ver = read_helper_cfbundle_version(&bundled_path);
    let installed_ver = read_helper_cfbundle_version(std::path::Path::new(BLESSED_HELPER_PATH));
    let needs_upgrade = match (&bundled_ver, &installed_ver) {
        (Some(b), Some(i)) => b != i,
        _ => false,
    };
    if needs_upgrade {
        log::info!(
            "[helper] CFBundleVersion bundled={:?} installed={:?}; upgrading via SMJobBless",
            bundled_ver,
            installed_ver
        );
        return install_helper_and_repair_disabled_state();
    }

    let mut ping_result = helper::api::ping();
    if let Err(first) = ping_result.as_ref() {
        if first.contains("xpc error:") || first.contains("timeout waiting for helper reply") {
            log::warn!(
                "[helper] initial ping failed ({}), retrying after XPC reconnect",
                first
            );
            std::thread::sleep(std::time::Duration::from_secs(1));
            ping_result = helper::api::ping();
        }
    }
    if ping_result.is_err() && is_blessed_helper_on_disk() && is_helper_disabled_in_launchd() {
        log::warn!("[helper] installed helper is disabled in launchd; clearing override (admin)");
        if repair_disabled_helper_via_admin().is_ok() {
            std::thread::sleep(std::time::Duration::from_secs(2));
            ping_result = helper::api::ping();
        }
    }
    if ping_result.is_err() {
        log::info!("[helper] not responding, triggering SMJobBless install...");
        return install_helper_and_repair_disabled_state();
    }

    Ok(())
}

fn bundled_helper_path() -> Option<std::path::PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let contents = exe.parent()?.parent()?;
    let p = contents
        .join("Library")
        .join("LaunchServices")
        .join("com.root.aurestream.helper");
    if p.exists() {
        Some(p)
    } else {
        None
    }
}

fn read_helper_cfbundle_version(path: &std::path::Path) -> Option<String> {
    let data = std::fs::read(path).ok()?;
    let key = b"<key>CFBundleVersion</key>";
    let key_pos = data.windows(key.len()).position(|w| w == key)?;
    let after_key = &data[key_pos + key.len()..];
    let open = b"<string>";
    let open_pos = after_key.windows(open.len()).position(|w| w == open)?;
    let value_start = open_pos + open.len();
    let close = b"</string>";
    let close_rel = after_key[value_start..]
        .windows(close.len())
        .position(|w| w == close)?;
    let bytes = &after_key[value_start..value_start + close_rel];
    std::str::from_utf8(bytes).ok().map(|s| s.to_string())
}
