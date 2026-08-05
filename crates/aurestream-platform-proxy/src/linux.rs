//! Linux system proxy via GNOME `gsettings` and/or KDE `kwriteconfig*`.
//!
//! Desktop detection is best-effort: many sessions report compound
//! `XDG_CURRENT_DESKTOP` values (`ubuntu:GNOME`, `KDE:Plasma`, …). We pick a
//! preferred backend then fall back so both GNOME-family and KDE work, and
//! headless / unknown DEs still succeed when either tool is available.

use std::env;
use std::path::PathBuf;
use std::process::Command;
use std::str::from_utf8;

use crate::helpers::{default_bypass, require_host};
use crate::ProxyError;

const GNOME_PROXY: &str = "org.gnome.system.proxy";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Backend {
    Gnome,
    Kde,
}

fn desktop_hint() -> String {
    // Prefer XDG_CURRENT_DESKTOP; fall back to DESKTOP_SESSION.
    let mut parts = Vec::new();
    if let Ok(v) = env::var("XDG_CURRENT_DESKTOP") {
        parts.push(v);
    }
    if let Ok(v) = env::var("DESKTOP_SESSION") {
        parts.push(v);
    }
    if let Ok(v) = env::var("XDG_SESSION_DESKTOP") {
        parts.push(v);
    }
    parts.join(":").to_ascii_lowercase()
}

fn preferred_backends() -> Vec<Backend> {
    let hint = desktop_hint();
    let kde_first = hint.split(&[':', ';', ','][..]).any(|p| {
        let p = p.trim();
        p == "kde" || p == "plasma" || p.starts_with("plasma")
    });
    if kde_first {
        vec![Backend::Kde, Backend::Gnome]
    } else {
        // Default to GNOME/gsettings first (covers GNOME, Cinnamon, Budgie,
        // many Ubuntu flavors, and most environments that ship dconf).
        vec![Backend::Gnome, Backend::Kde]
    }
}

fn gsettings() -> Command {
    let mut cmd = Command::new("gsettings");
    // AppImage mounts can inject a private PATH/LD_LIBRARY_PATH that breaks
    // host gsettings; strip those so we talk to the real desktop session.
    if env::var_os("APPIMAGE").is_some() {
        cmd.env_remove("LD_LIBRARY_PATH");
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

fn kde_tool_name(kind: &str) -> &'static str {
    // kind = "read" | "write"
    let version = env::var("KDE_SESSION_VERSION").unwrap_or_default();
    match (kind, version.as_str()) {
        ("read", "6") => "kreadconfig6",
        ("write", "6") => "kwriteconfig6",
        ("read", _) => "kreadconfig5",
        ("write", _) => "kwriteconfig5",
        _ => "kwriteconfig5",
    }
}

fn kwriteconfig() -> Command {
    let preferred = kde_tool_name("write");
    for name in [preferred, "kwriteconfig6", "kwriteconfig5"] {
        if which_exists(name) {
            let mut cmd = Command::new(name);
            scrub_appimage_env(&mut cmd);
            return cmd;
        }
    }
    let mut cmd = Command::new(preferred);
    scrub_appimage_env(&mut cmd);
    cmd
}

fn which_exists(name: &str) -> bool {
    Command::new(name)
        .arg("--help")
        .output()
        .map(|o| o.status.success() || !o.stdout.is_empty() || !o.stderr.is_empty())
        .unwrap_or(false)
}

fn scrub_appimage_env(cmd: &mut Command) {
    if env::var_os("APPIMAGE").is_some() {
        cmd.env_remove("LD_LIBRARY_PATH");
    }
}

fn kde_config_path() -> Result<PathBuf, ProxyError> {
    if let Ok(xdg) = env::var("XDG_CONFIG_HOME") {
        if !xdg.is_empty() {
            return Ok(PathBuf::from(xdg).join("kioslaverc"));
        }
    }
    let home = env::var_os("HOME").ok_or_else(|| {
        ProxyError::Platform("HOME is unset; cannot locate kioslaverc".into())
    })?;
    Ok(PathBuf::from(home).join(".config/kioslaverc"))
}

fn set_gnome(host: &str, port: u16) -> Result<(), ProxyError> {
    let port_s = port.to_string();
    // gsettings string values should be quoted.
    let host_q = format!("'{host}'");
    for service in ["http", "https", "socks"] {
        let schema = format!("{GNOME_PROXY}.{service}");
        run_gsettings(&["set", &schema, "host", &host_q])?;
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
        ("ftpProxy", "http"),
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
    // 1 = Manual proxy
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
    // 0 = No proxy
    run_kwrite(
        config,
        &["--group", "Proxy Settings", "--key", "ProxyType", "0"],
    )
}

fn run_kwrite(config: &str, args: &[&str]) -> Result<(), ProxyError> {
    let mut cmd = kwriteconfig();
    cmd.args(["--file", config]);
    cmd.args(args);
    let output = cmd.output()?;
    if !output.status.success() {
        let stderr = from_utf8(&output.stderr).unwrap_or("").trim();
        return Err(ProxyError::Platform(format!(
            "kwriteconfig failed: {stderr}"
        )));
    }
    Ok(())
}

fn try_backends<F>(op: F) -> Result<(), ProxyError>
where
    F: Fn(Backend) -> Result<(), ProxyError>,
{
    let mut last_err: Option<ProxyError> = None;
    for backend in preferred_backends() {
        match op(backend) {
            Ok(()) => return Ok(()),
            Err(e) => last_err = Some(e),
        }
    }
    Err(last_err.unwrap_or_else(|| {
        ProxyError::Unsupported("no Linux system-proxy backend available (need gsettings or kwriteconfig)")
    }))
}

pub fn set_system_proxy(host: &str, port: u16) -> Result<(), ProxyError> {
    let host = require_host(host)?;
    try_backends(|backend| match backend {
        Backend::Gnome => set_gnome(host, port),
        Backend::Kde => set_kde(host, port),
    })
}

pub fn clear_system_proxy() -> Result<(), ProxyError> {
    try_backends(|backend| match backend {
        Backend::Gnome => clear_gnome(),
        Backend::Kde => clear_kde(),
    })
}
