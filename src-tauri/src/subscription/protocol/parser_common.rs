//! RawProxyNode（已由 FormatParser 填好 canonical）→ [`crate::models::Endpoint`]。

use crate::error::AppError;
use crate::models::endpoint::{Endpoint, EndpointMetadata};
use crate::models::RawProxyNode;

pub fn endpoint_from_raw(raw: &RawProxyNode, source_id: &str) -> Result<Endpoint, AppError> {
    let name = raw.canonical.name.trim();
    if name.is_empty() {
        return Err(AppError::other("节点名为空"));
    }
    if raw.canonical.server.is_empty() || raw.canonical.port == 0 {
        return Err(AppError::other("server/port 无效"));
    }

    let ep = Endpoint {
        id: name.to_string(),
        name: name.to_string(),
        protocol: raw.protocol.clone(),
        server: raw.canonical.server.clone(),
        port: raw.canonical.port,
        udp: raw.canonical.udp,
        tls: raw.canonical.tls,
        network: raw.canonical.network.clone(),
        auth: raw.canonical.auth.clone(),
        transport: raw.canonical.transport.clone(),
        metadata: EndpointMetadata::default(),
        source_id: source_id.to_string(),
        unique_hash: String::new(),
        raw: Some(raw.extra.clone()),
    }
    .with_hash();
    Ok(ep)
}
