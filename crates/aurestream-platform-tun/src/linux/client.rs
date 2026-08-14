//! Unprivileged Unix-socket client for the systemd TUN helper.

use super::protocol::{
    decode_response, encode_request, socket_path, TunRequest, TunResponse,
};
use crate::TunError;
use std::io::{BufRead, BufReader, Write};
use std::os::unix::net::UnixStream;
use std::time::Duration;

const START_TIMEOUT: Duration = Duration::from_secs(60);
const STOP_TIMEOUT: Duration = Duration::from_secs(15);
const STATUS_TIMEOUT: Duration = Duration::from_secs(3);

pub fn status() -> Result<String, TunError> {
    let resp = rpc(TunRequest::Status, STATUS_TIMEOUT)?;
    if resp.ok {
        Ok(resp.state)
    } else {
        Err(TunError::failed(
            "tun_status",
            resp.error.unwrap_or_else(|| "status failed".into()),
        ))
    }
}

pub fn start(req: TunRequest) -> Result<(), TunError> {
    let resp = rpc(req, START_TIMEOUT)?;
    if resp.ok {
        log::info!("[tun/linux] helper ready (state={})", resp.state);
        Ok(())
    } else {
        Err(TunError::failed(
            "tun_start",
            resp.error.unwrap_or_else(|| "虚拟网卡启动失败".into()),
        ))
    }
}

pub fn stop() -> Result<(), TunError> {
    log::info!("[tun/linux] socket stop-tun");
    let resp = rpc(TunRequest::Stop, STOP_TIMEOUT)?;
    if resp.ok {
        log::info!("[tun/linux] helper stopped (state={})", resp.state);
        Ok(())
    } else {
        Err(TunError::failed(
            "tun_stop",
            resp.error.unwrap_or_else(|| "虚拟网卡未能完全关闭".into()),
        ))
    }
}

fn rpc(req: TunRequest, timeout: Duration) -> Result<TunResponse, TunError> {
    let path = socket_path();
    let mut stream = UnixStream::connect(&path).map_err(|e| {
        TunError::failed(
            "tun_socket",
            format!(
                "无法连接虚拟网卡服务 ({}): {e}。请确认 aurestream-tun.socket 已启用。",
                path.display()
            ),
        )
    })?;
    stream
        .set_read_timeout(Some(timeout))
        .and_then(|_| stream.set_write_timeout(Some(Duration::from_secs(5))))
        .map_err(|e| TunError::failed("tun_socket", format!("set socket timeout: {e}")))?;

    let encoded = encode_request(&req)
        .map_err(|e| TunError::failed("tun_socket", format!("encode request: {e}")))?;
    stream
        .write_all(encoded.as_bytes())
        .and_then(|_| stream.flush())
        .map_err(|e| TunError::failed("tun_socket", format!("write request: {e}")))?;

    let mut reader = BufReader::new(stream);
    let mut line = String::new();
    reader
        .read_line(&mut line)
        .map_err(|e| TunError::failed("tun_socket", format!("read response: {e}")))?;
    decode_response(&line).map_err(|e| TunError::failed("tun_socket", e))
}
