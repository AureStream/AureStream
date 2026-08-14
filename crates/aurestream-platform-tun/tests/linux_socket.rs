#![cfg(target_os = "linux")]

use std::io::{BufRead, BufReader, Write};
use std::os::unix::net::UnixStream;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

#[test]
fn serve_status_returns_idle_on_temp_socket() {
    let dir = tempfile::tempdir().unwrap();
    let sock = dir.path().join("app.sock");
    let mut child = Command::new(env!("CARGO_BIN_EXE_aurestream-tun-helper"))
        .arg("serve")
        .env("AURESTREAM_TUN_SOCKET", &sock)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("spawn helper");

    let deadline = Instant::now() + Duration::from_secs(2);
    while !sock.exists() && Instant::now() < deadline {
        thread::sleep(Duration::from_millis(20));
    }
    assert!(sock.exists(), "helper did not bind {}", sock.display());

    let mut stream = UnixStream::connect(&sock).expect("connect");
    stream
        .write_all(b"{\"cmd\":\"status\"}\n")
        .and_then(|_| stream.flush())
        .unwrap();
    let mut line = String::new();
    BufReader::new(stream).read_line(&mut line).unwrap();
    let v: serde_json::Value = serde_json::from_str(&line).unwrap();
    assert_eq!(v["ok"], true);
    assert_eq!(v["state"], "idle");

    let _ = child.kill();
    let _ = child.wait();
}
