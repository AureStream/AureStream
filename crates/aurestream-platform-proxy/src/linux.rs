//! Linux system proxy via GNOME `gsettings` or KDE `kwriteconfig*`.

use std::env;
use std::path::PathBuf;
use std::process::Command;
use std::str::from_utf8;

use crate::helpers::{default_bypass, require_host};
use crate::ProxyError;

const GNOME_PROXY: &str = "org.gnome.system.proxy";

fn is_kde() -> bool {
    env::var("XDG_CURRENT_DESKTOP")
        .unwrap_or_default()
        .eq_ignore_ascii_case("KDE")
}

fn gsettings() -> Command {
    let mut cmd = Command::new("gsettings");
    if env::var_os("APPIMAGE").is_some() {
        if let Ok(path) = env::var("PATH") {
            let cleaned: Vec<&str> = path
                .split(':')
                .filter(|p| !p.contains("appimage") && !p.contains("/tmp/.mount_"))
                .collect();
            cmd.env("PATH", cleaned.join(":"));
        }
    }
    cmd
}

fn kwriteconfig() -> Command {
    for name in ["kwriteconfig6", "kwriteconfig5"] {
        if Command::new(name).arg("--help").output().is_ok() {
            return Command::new(name);
        }
    }
    Command::new("kwriteconfig5")
}

fn kde_config_path() -> Result<PathBuf, ProxyError> {
    let home = env::var_os("HOME").ok_or_else(|| {
        ProxyError::Platform("HOME is unset; cannot locate kioslaverc".into())
    })?;
    Ok(PathBuf::from(home).join(".config/kioslaverc"))
}

fn set_gnome(host: &str, port: u16) -> Result<(), ProxyError> {
    let port_s = port.to_string();
    for service in ["http", "https", "socks"] {
        let schema = format!("{GNOME_PROXY}.{service}");
        run_gsettings(&["set", &schema, "host", host])?;
        run_gsettings(&["set", &schema, "port", &port_s])?;
    }

    let bypass = default_bypass()
        .split(',')
        .map(|h| {
            let h = h.trim();
            if h.starts_with('\'') || h.starts_with('"') {
                h.to_string()
            } else {
                format!("'{h}'")
            }
        })
        .collect::<Vec<_>>()
        .join(", ");
    let bypass = format!("[{bypass}]");
    run_gsettings(&["set", GNOME_PROXY, "ignore-hosts", &bypass])?;
    run_gsettings(&["set", GNOME_PROXY, "mode", "'manual'"])?;
    Ok(())
}

fn clear_gnome() -> Result<(), ProxyError> {
    run_gsettings(&["set", GNOME_PROXY, "mode", "'none'"])
}

fn run_gsettings(args: &[&str]) -> Result<(), ProxyError> {
    let output = gsettings().args(args).output()?;
    if !output.status.success() {
        let stderr = from_utf8(&output.stderr).unwrap_or("").trim();
        return Err(ProxyError::Platform(format!(
            "gsettings {} failed: {stderr}",
            args.join(" ")
        )));
    }
    Ok(())
}

fn set_kde(host: &str, port: u16) -> Result<(), ProxyError> {
    let config = kde_config_path()?;
    let config = config
        .to_str()
        .ok_or_else(|| ProxyError::Platform("kioslaverc path is not utf-8".into()))?;

    for (key, scheme) in [
        ("httpProxy", "http"),
        ("httpsProxy", "http"),
        ("socksProxy", "socks"),
    ] {
        let value = format!("{scheme}://{host} {port}");
        run_kwrite(
            config,
            &[
                "--group",
                "Proxy Settings",
                "--key",
                key,
                value.as_str(),
            ],
        )?;
    }
    run_kwrite(
        config,
        &[
            "--group",
            "Proxy Settings",
            "--key",
            "NoProxyFor",
            default_bypass(),
        ],
    )?;
    run_kwrite(
        config,
        &["--group", "Proxy Settings", "--key", "ProxyType", "1"],
    )?;
    Ok(())
}

fn clear_kde() -> Result<(), ProxyError> {
    let config = kde_config_path()?;
    let config = config
        .to_str()
        .ok_or_else(|| ProxyError::Platform("kioslaverc path is not utf-8".into()))?;
    run_kwrite(
        config,
        &["--group", "Proxy Settings", "--key", "ProxyType", "0"],
    )
}

fn run_kwrite(config: &str, args: &[&str]) -> Result<(), ProxyError> {
    let mut cmd = kwriteconfig();
    cmd.args(["--file", config]);
    cmd.args(args);
    let status = cmd.status()?;
    if !status.success() {
        return Err(ProxyError::Platform("kwriteconfig failed".into()));
    }
    Ok(())
}

pub fn set_system_proxy(host: &str, port: u16) -> Result<(), ProxyError> {
    let host = require_host(host)?;
    if is_kde() {
        set_kde(host, port)
    } else {
        set_gnome(host, port)
    }
}

pub fn clear_system_proxy() -> Result<(), ProxyError> {
    if is_kde() {
        clear_kde()
    } else {
        clear_gnome()
    }
}
