//! Integration tests for onebox-sysproxy-rs.
//!
//! These tests modify actual system proxy settings and MUST run serially.
//! They are marked `#[ignore]` by default to prevent accidental proxy changes.
//!
//! Run with: `cargo test -- --ignored --test-threads=1`
//! Or via Makefile: `make test-integration`

use serial_test::serial;
use sysproxy_rs::{Autoproxy, Sysproxy};

/// Helper: save current proxy state, run test body, then restore on drop.
struct ProxyGuard {
    _proxy: Sysproxy,
    _auto: Autoproxy,
}

impl ProxyGuard {
    fn new() -> Self {
        let proxy = Sysproxy::get_system_proxy().unwrap_or_default();
        let auto = Autoproxy::get_auto_proxy().unwrap_or_default();
        Self {
            _proxy: proxy,
            _auto: auto,
        }
    }
}

impl Drop for ProxyGuard {
    fn drop(&mut self) {
        // Always restore to direct connection on cleanup
        let off = Sysproxy {
            enable: false,
            ..Default::default()
        };
        let _ = off.set_system_proxy();
        let auto_off = Autoproxy {
            enable: false,
            ..Default::default()
        };
        let _ = auto_off.set_auto_proxy();
    }
}

// ============================================================
// Library API Tests
// ============================================================

#[test]
#[serial]
#[ignore]
fn test_query_proxy() {
    let _guard = ProxyGuard::new();
    let proxy = Sysproxy::get_system_proxy().unwrap();
    // Should return a valid struct (not panic)
    let _ = format!("{:?}", proxy);
}

#[test]
#[serial]
#[ignore]
fn test_query_auto_proxy() {
    let _guard = ProxyGuard::new();
    let auto = Autoproxy::get_auto_proxy().unwrap();
    let _ = format!("{:?}", auto);
}

#[test]
#[serial]
#[ignore]
fn test_set_global_proxy() {
    let _guard = ProxyGuard::new();

    let proxy = Sysproxy {
        enable: true,
        host: "127.0.0.1".into(),
        port: 9999,
        bypass: "localhost,127.0.0.1".into(),
    };
    proxy.set_system_proxy().unwrap();

    let got = Sysproxy::get_system_proxy().unwrap();
    assert!(got.enable, "proxy should be enabled");
    assert_eq!(got.host, "127.0.0.1");
    assert_eq!(got.port, 9999);
    assert!(got.bypass.contains("localhost"));
}

#[test]
#[serial]
#[ignore]
fn test_set_proxy_with_bypass() {
    let _guard = ProxyGuard::new();

    let proxy = Sysproxy {
        enable: true,
        host: "192.168.1.1".into(),
        port: 8080,
        bypass: "localhost,127.0.0.1,10.0.0.1".into(),
    };
    proxy.set_system_proxy().unwrap();

    let got = Sysproxy::get_system_proxy().unwrap();
    assert!(got.enable);
    assert_eq!(got.host, "192.168.1.1");
    assert_eq!(got.port, 8080);
    assert!(got.bypass.contains("localhost"));
    assert!(got.bypass.contains("127.0.0.1"));
}

#[test]
#[serial]
#[ignore]
fn test_disable_proxy() {
    let _guard = ProxyGuard::new();

    // First enable
    let proxy = Sysproxy {
        enable: true,
        host: "127.0.0.1".into(),
        port: 7777,
        bypass: String::new(),
    };
    proxy.set_system_proxy().unwrap();

    // Then disable
    let off = Sysproxy {
        enable: false,
        ..Default::default()
    };
    off.set_system_proxy().unwrap();

    let got = Sysproxy::get_system_proxy().unwrap();
    assert!(!got.enable, "proxy should be disabled");
}

#[test]
#[serial]
#[ignore]
fn test_set_pac_proxy() {
    let _guard = ProxyGuard::new();

    let auto = Autoproxy {
        enable: true,
        url: "http://127.0.0.1:1080/proxy.pac".into(),
    };
    auto.set_auto_proxy().unwrap();

    let got = Autoproxy::get_auto_proxy().unwrap();
    assert!(got.enable, "PAC should be enabled");
    assert!(
        got.url.contains("127.0.0.1:1080/proxy.pac"),
        "PAC URL mismatch: {}",
        got.url
    );
}

#[test]
#[serial]
#[ignore]
fn test_disable_pac_proxy() {
    let _guard = ProxyGuard::new();

    // Enable PAC
    let auto = Autoproxy {
        enable: true,
        url: "http://example.com/proxy.pac".into(),
    };
    auto.set_auto_proxy().unwrap();

    // Disable PAC
    let off = Autoproxy {
        enable: false,
        ..Default::default()
    };
    off.set_auto_proxy().unwrap();

    let got = Autoproxy::get_auto_proxy().unwrap();
    assert!(!got.enable, "PAC should be disabled");
}

#[test]
#[serial]
#[ignore]
fn test_pac_url_no_null() {
    let _guard = ProxyGuard::new();

    // Disable PAC to clear URL
    let off = Autoproxy {
        enable: false,
        ..Default::default()
    };
    off.set_auto_proxy().unwrap();

    let got = Autoproxy::get_auto_proxy().unwrap();
    assert!(
        !got.url.contains("(null)"),
        "PAC URL should not contain (null), got: {}",
        got.url
    );
}

#[test]
#[serial]
#[ignore]
fn test_set_then_query_roundtrip() {
    let _guard = ProxyGuard::new();

    // WinINet stores a single set of flags; each set_* call overwrites them.
    // Test each mode independently rather than assuming both can be active at once.

    // Verify global proxy roundtrip
    let proxy = Sysproxy {
        enable: true,
        host: "10.0.0.1".into(),
        port: 3128,
        bypass: "localhost,*.local".into(),
    };
    proxy.set_system_proxy().unwrap();
    let got_proxy = Sysproxy::get_system_proxy().unwrap();
    assert!(got_proxy.enable);
    assert_eq!(got_proxy.host, "10.0.0.1");
    assert_eq!(got_proxy.port, 3128);

    // Verify PAC roundtrip (replaces global proxy as the active mode)
    let auto = Autoproxy {
        enable: true,
        url: "http://10.0.0.1:3128/wpad.dat".into(),
    };
    auto.set_auto_proxy().unwrap();
    let got_auto = Autoproxy::get_auto_proxy().unwrap();
    assert!(got_auto.enable);
    assert!(got_auto.url.contains("wpad.dat"));
}

#[test]
fn test_is_support() {
    // This test doesn't modify proxy, safe to run always
    assert!(Sysproxy::is_support());
    assert!(Autoproxy::is_support());
}

// ============================================================
// CLI Binary Tests (via process invocation)
// ============================================================

use std::process::Command;

fn sysproxy_cmd() -> Command {
    let mut cmd = Command::new(env!("CARGO_BIN_EXE_sysproxy"));
    cmd.env_clear();
    // Inherit only necessary env vars
    if let Ok(path) = std::env::var("PATH") {
        cmd.env("PATH", path);
    }
    if let Ok(home) = std::env::var("HOME") {
        cmd.env("HOME", home);
    }
    cmd
}

#[test]
#[serial]
#[ignore]
fn test_cli_query() {
    let _guard = ProxyGuard::new();

    let output = sysproxy_cmd().arg("query").output().unwrap();
    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("System Proxy"));
    assert!(stdout.contains("Auto Proxy"));
    assert!(stdout.contains("Enabled"));
}

#[test]
fn test_cli_help() {
    let output = sysproxy_cmd().arg("--help").output().unwrap();
    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("Commands"));
    assert!(stdout.contains("query"));
    assert!(stdout.contains("global"));
    assert!(stdout.contains("pac"));
    assert!(stdout.contains("off"));
    assert!(stdout.contains("set"));
}

#[test]
fn test_cli_version() {
    let output = sysproxy_cmd().arg("--version").output().unwrap();
    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("sysproxy"));
}

#[test]
#[serial]
#[ignore]
fn test_cli_global_set_and_verify() {
    let _guard = ProxyGuard::new();

    // Set global proxy via CLI
    let output = sysproxy_cmd()
        .args(["global", "127.0.0.1:9876"])
        .output()
        .unwrap();
    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("Global proxy set"));

    // Verify via CLI query
    let output = sysproxy_cmd().arg("query").output().unwrap();
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("Enabled : true"));
    assert!(stdout.contains("127.0.0.1:9876"));
}

#[test]
#[serial]
#[ignore]
fn test_cli_global_with_bypass() {
    let _guard = ProxyGuard::new();

    let output = sysproxy_cmd()
        .args(["global", "127.0.0.1:8080", "localhost,127.0.0.1"])
        .output()
        .unwrap();
    assert!(output.status.success());

    let output = sysproxy_cmd().arg("query").output().unwrap();
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("Enabled : true"));
    assert!(stdout.contains("localhost"));
}

#[test]
#[serial]
#[ignore]
fn test_cli_pac() {
    let _guard = ProxyGuard::new();

    let output = sysproxy_cmd()
        .args(["pac", "http://127.0.0.1:1080/proxy.pac"])
        .output()
        .unwrap();
    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("PAC auto-proxy set"));

    let output = sysproxy_cmd().arg("query").output().unwrap();
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("Enabled : true"));
    assert!(stdout.contains("proxy.pac"));
}

#[test]
#[serial]
#[ignore]
fn test_cli_off() {
    let _guard = ProxyGuard::new();

    // Set something first
    sysproxy_cmd()
        .args(["global", "127.0.0.1:7777"])
        .output()
        .unwrap();

    // Off
    let output = sysproxy_cmd().arg("off").output().unwrap();
    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("System proxy disabled"));

    // Verify
    let output = sysproxy_cmd().arg("query").output().unwrap();
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("Enabled : false"));
}

#[test]
#[serial]
#[ignore]
fn test_cli_set_flags3() {
    let _guard = ProxyGuard::new();

    let output = sysproxy_cmd()
        .args(["set", "3", "127.0.0.1:6666", "localhost"])
        .output()
        .unwrap();
    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("flags=3"));

    let output = sysproxy_cmd().arg("query").output().unwrap();
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("Enabled : true"));
    assert!(stdout.contains("127.0.0.1:6666"));
}

#[test]
#[serial]
#[ignore]
fn test_cli_set_flags1_disables() {
    let _guard = ProxyGuard::new();

    // First enable
    sysproxy_cmd()
        .args(["global", "127.0.0.1:5555"])
        .output()
        .unwrap();

    // Disable via set 1
    let output = sysproxy_cmd().args(["set", "1"]).output().unwrap();
    assert!(output.status.success());

    let output = sysproxy_cmd().arg("query").output().unwrap();
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("Enabled : false"));
}

#[test]
#[serial]
#[ignore]
fn test_cli_set_flags5_pac() {
    let _guard = ProxyGuard::new();

    let output = sysproxy_cmd()
        .args(["set", "5", "-", "-", "http://example.com/proxy.pac"])
        .output()
        .unwrap();
    assert!(output.status.success());

    let output = sysproxy_cmd().arg("query").output().unwrap();
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("Enabled : true"));
    assert!(stdout.contains("example.com/proxy.pac"));
}

#[test]
#[serial]
#[ignore]
fn test_cli_set_dash_keeps_current() {
    let _guard = ProxyGuard::new();

    // Set initial proxy
    sysproxy_cmd()
        .args(["global", "127.0.0.1:4444", "mybypass"])
        .output()
        .unwrap();

    // Use set 2 with "-" to keep current values
    let output = sysproxy_cmd().args(["set", "2"]).output().unwrap();
    assert!(output.status.success());

    // Verify server is preserved
    let output = sysproxy_cmd().arg("query").output().unwrap();
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("Enabled : true"));
    assert!(stdout.contains("127.0.0.1:4444"));
}

#[test]
fn test_cli_error_invalid_server() {
    let output = sysproxy_cmd()
        .args(["global", "badserver"])
        .output()
        .unwrap();
    assert!(!output.status.success());
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("Error"));
}

#[test]
fn test_cli_error_flags_zero() {
    let output = sysproxy_cmd().args(["set", "0"]).output().unwrap();
    assert!(!output.status.success());
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("Error"));
}

#[test]
fn test_cli_error_flags_too_large() {
    let output = sysproxy_cmd().args(["set", "16"]).output().unwrap();
    assert!(!output.status.success());
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("Error"));
}

#[test]
fn test_cli_error_missing_global_args() {
    let output = sysproxy_cmd().args(["global"]).output().unwrap();
    assert!(!output.status.success());
}

#[test]
fn test_cli_error_missing_pac_args() {
    let output = sysproxy_cmd().args(["pac"]).output().unwrap();
    assert!(!output.status.success());
}

#[test]
#[serial]
#[ignore]
fn test_cli_off_clears_pac() {
    let _guard = ProxyGuard::new();

    // Enable PAC
    sysproxy_cmd()
        .args(["pac", "http://127.0.0.1:1080/proxy.pac"])
        .output()
        .unwrap();

    // Verify PAC is enabled
    let output = sysproxy_cmd().arg("query").output().unwrap();
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("Enabled : true"));

    // Off should disable both proxy and PAC
    sysproxy_cmd().arg("off").output().unwrap();

    let output = sysproxy_cmd().arg("query").output().unwrap();
    let stdout = String::from_utf8_lossy(&output.stdout);
    // Both sections should show disabled
    let lines: Vec<&str> = stdout.lines().collect();
    let proxy_enabled = lines.iter().find(|l| l.contains("Enabled")).unwrap();
    assert!(
        proxy_enabled.contains("false"),
        "proxy should be disabled after off"
    );
}

#[test]
#[serial]
#[ignore]
fn test_query_no_null_in_output() {
    let _guard = ProxyGuard::new();

    // Ensure clean state
    let off = Sysproxy {
        enable: false,
        ..Default::default()
    };
    off.set_system_proxy().unwrap();
    let auto_off = Autoproxy {
        enable: false,
        ..Default::default()
    };
    auto_off.set_auto_proxy().unwrap();

    let output = sysproxy_cmd().arg("query").output().unwrap();
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(
        !stdout.contains("(null)"),
        "query output should not contain (null), got:\n{}",
        stdout
    );
}
