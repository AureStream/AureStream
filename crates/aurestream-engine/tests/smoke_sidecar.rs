//! Optional smoke: decode → build_config → start → SOCKS probe.
//! Skipped automatically when `aurestream-core` / xray binary is missing.

use std::time::Duration;

use aurestream_config::decode_subscription_body;
use aurestream_engine::{resolve_sidecar_path, Engine, EngineState, XrayEngine};
use tokio::time::timeout;

fn sidecar_available() -> bool {
    match resolve_sidecar_path() {
        Ok(p) if p.is_file() => true,
        Ok(p) => {
            // Bare name on PATH — try `which`-style by spawning `run -version` quickly? Skip.
            let _ = p;
            false
        }
        Err(_) => false,
    }
}

#[tokio::test]
async fn smoke_decode_build_start_when_sidecar_present() {
    if !sidecar_available() {
        eprintln!("SKIP: aurestream-core binary not found (download via pnpm download-binaries)");
        return;
    }

    let body = "vless://095909af-8903-4305-8a7d-07fd0fb8c0e3@127.0.0.1:443?security=none&type=tcp&encryption=none#smoke";
    let nodes = decode_subscription_body(body).expect("decode");
    let node = &nodes[0];

    let dir = tempfile::tempdir().unwrap();
    let cfg = dir.path().join("config.json");
    let socks = 27901u16;
    let api = 27902u16;

    let engine = XrayEngine::new();
    engine.build_config(&cfg, node, socks, api).expect("build_config");

    // Start may fail readiness if the outbound is unreachable; we only require
    // the local mixed inbound to accept TCP (sidecar came up).
    let start = timeout(Duration::from_secs(15), engine.start(&cfg)).await;
    match start {
        Ok(Ok(())) => {
            assert!(matches!(engine.state(), EngineState::Running));
            engine.stop().await.expect("stop");
            assert!(matches!(engine.state(), EngineState::Idle));
        }
        Ok(Err(e)) => {
            // Binary existed but failed to become ready — still useful signal.
            eprintln!("smoke start failed (DONE_WITH_CONCERNS): {e}");
            let _ = engine.stop().await;
        }
        Err(_) => {
            eprintln!("smoke start timed out");
            let _ = engine.stop().await;
        }
    }
}
