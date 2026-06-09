use std::process::Command;

use tauri::AppHandle;
use tauri_plugin_shell::{process::Command as TauriCommand, ShellExt};

pub const HELPER_PATH: &str = "/usr/lib/AureStream/aurestream-tun-helper";

pub fn create_privileged_command(
    app: &AppHandle,
    sidecar_path: String,
    config_path: String,
    dns_override_args: Option<(String, String, Vec<String>)>,
) -> TauriCommand {
    let mut args = vec![
        HELPER_PATH.to_string(),
        "start-tun".to_string(),
        sidecar_path,
        config_path,
    ];

    if let Some((iface, gateway, original_servers)) = dns_override_args {
        if !gateway.is_empty() {
            args.push(iface);
            args.push(gateway);
            args.extend(original_servers);
        }
    }

    let args_ref: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    app.shell().command("pkexec").args(args_ref)
}

pub fn uninstall_helper_sync(
    stop_first: impl FnOnce() -> Result<(), String>,
) -> Result<(), String> {
    if !std::path::Path::new(HELPER_PATH).exists() {
        log::info!("[linux] helper not present, nothing to uninstall");
        return Ok(());
    }

    let _ = stop_first();

    log::info!("[linux] uninstalling helper via pkexec");
    let output = Command::new("pkexec")
        .args([HELPER_PATH, "uninstall"])
        .output()
        .map_err(|e| format!("pkexec uninstall failed: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!(
            "helper uninstall failed (exit {}): {} {}",
            output.status,
            stdout.trim(),
            stderr.trim()
        )
        .trim()
        .to_string());
    }

    if std::path::Path::new(HELPER_PATH).exists() {
        return Err(format!(
            "{HELPER_PATH} still exists after uninstall - reinstall the AureStream Linux package or update the helper script"
        ));
    }

    log::info!("[linux] helper uninstall completed");
    Ok(())
}

pub fn stop_tun_and_restore_dns(dns_override: Option<&(String, String)>) -> Result<(), String> {
    let mut args = vec![HELPER_PATH, "stop-tun"];

    let iface_owned;
    let servers_owned;
    if let Some((iface, original_dns)) = dns_override {
        log::info!(
            "[dns] restore: setting [{}] DNS back to {}",
            iface,
            original_dns
        );
        iface_owned = iface.clone();
        servers_owned = original_dns.clone();
        args.push(&iface_owned);
        for server in servers_owned.split_whitespace() {
            args.push(server);
        }
    }

    let out = Command::new("pkexec")
        .args(&args)
        .output()
        .map_err(|e| format!("pkexec stop failed: {}", e))?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr).to_string();
        return Err(format!("[stop] pkexec non-zero exit: {}", stderr.trim()));
    }
    Ok(())
}

pub fn stop_tun_process() -> Result<(), String> {
    stop_tun_and_restore_dns(None)
}

pub fn apply_dns_override(iface: &str, gateway: &str, original_dns: &str) -> Result<(), String> {
    let out = Command::new("pkexec")
        .arg(HELPER_PATH)
        .arg("dns-override")
        .arg(iface)
        .arg(gateway)
        .args(original_dns.split_whitespace())
        .output()
        .map_err(|e| format!("pkexec dns-override failed: {}", e))?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        log::warn!("[dns] dns-override non-zero exit: {}", stderr);
    }
    Ok(())
}

pub fn restore_dns(iface: &str, original_dns: &str) -> Result<(), String> {
    let mut args = vec![HELPER_PATH, "dns-restore", iface];
    let servers: Vec<&str> = original_dns.split_whitespace().collect();
    args.extend(servers);

    let out = Command::new("pkexec")
        .args(&args)
        .output()
        .map_err(|e| format!("pkexec dns-restore failed: {}", e))?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        return Err(format!("[dns] restore failed: {}", stderr));
    }
    Ok(())
}

pub fn reload() -> Result<(), String> {
    super::reload_via_pkexec(HELPER_PATH)
}
