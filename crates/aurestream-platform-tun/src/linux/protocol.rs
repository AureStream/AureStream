//! JSON-line control protocol for the Linux TUN systemd helper.

use serde::{Deserialize, Serialize};

pub const SOCKET_PATH: &str = "/run/aurestream-tun/app.sock";
pub const RUNTIME_DIR: &str = "/run/aurestream-tun";

/// Socket path, overridable via `AURESTREAM_TUN_SOCKET` (tests / local serve).
pub fn socket_path() -> std::path::PathBuf {
    std::env::var("AURESTREAM_TUN_SOCKET")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| std::path::PathBuf::from(SOCKET_PATH))
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "cmd", rename_all = "kebab-case")]
pub enum TunRequest {
    Start {
        config: String,
        caller_pid: u32,
        api_port: u16,
        dns: String,
        iface: String,
        #[serde(default)]
        original_dns: Vec<String>,
    },
    Stop,
    Status,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TunResponse {
    pub ok: bool,
    pub state: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl TunResponse {
    pub fn ok_state(state: impl Into<String>) -> Self {
        Self {
            ok: true,
            state: state.into(),
            error: None,
        }
    }

    pub fn fail(state: impl Into<String>, error: impl Into<String>) -> Self {
        Self {
            ok: false,
            state: state.into(),
            error: Some(error.into()),
        }
    }
}

/// Encode one request as a single JSON line (trailing newline).
pub fn encode_request(req: &TunRequest) -> Result<String, serde_json::Error> {
    let mut line = serde_json::to_string(req)?;
    line.push('\n');
    Ok(line)
}

/// Decode one JSON line. Empty / whitespace-only lines are rejected.
pub fn decode_request(line: &str) -> Result<TunRequest, String> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return Err("empty request".into());
    }
    serde_json::from_str(trimmed).map_err(|e| format!("invalid request: {e}"))
}

pub fn encode_response(resp: &TunResponse) -> Result<String, serde_json::Error> {
    let mut line = serde_json::to_string(resp)?;
    line.push('\n');
    Ok(line)
}

pub fn decode_response(line: &str) -> Result<TunResponse, String> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return Err("empty response".into());
    }
    serde_json::from_str(trimmed).map_err(|e| format!("invalid response: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn start_round_trips_as_json_line() {
        let req = TunRequest::Start {
            config: "/home/u/.local/share/com.root.aurestream/xray-config.json".into(),
            caller_pid: 403050,
            api_port: 10809,
            dns: "1.1.1.1".into(),
            iface: "ens160".into(),
            original_dns: vec!["8.8.8.8".into(), "114.114.114.114".into()],
        };
        let encoded = encode_request(&req).unwrap();
        assert!(encoded.ends_with('\n'));
        assert_eq!(encoded.matches('\n').count(), 1);
        assert_eq!(decode_request(&encoded).unwrap(), req);
    }

    #[test]
    fn stop_and_status_are_tagged_cmds() {
        let stop = encode_request(&TunRequest::Stop).unwrap();
        let status = encode_request(&TunRequest::Status).unwrap();
        assert!(stop.contains(r#""cmd":"stop""#));
        assert!(status.contains(r#""cmd":"status""#));
        assert_eq!(decode_request(&stop).unwrap(), TunRequest::Stop);
        assert_eq!(decode_request(&status).unwrap(), TunRequest::Status);
    }

    #[test]
    fn rejects_empty_and_garbage() {
        assert!(decode_request("").is_err());
        assert!(decode_request("   \n").is_err());
        assert!(decode_request("not-json\n").is_err());
        assert!(decode_response("").is_err());
    }

    #[test]
    fn response_ok_and_fail() {
        let ok = TunResponse::ok_state("running");
        let fail = TunResponse::fail("idle", "虚拟网卡内核提前退出");
        assert_eq!(decode_response(&encode_response(&ok).unwrap()).unwrap(), ok);
        let decoded = decode_response(&encode_response(&fail).unwrap()).unwrap();
        assert!(!decoded.ok);
        assert_eq!(decoded.error.as_deref(), Some("虚拟网卡内核提前退出"));
    }
}
