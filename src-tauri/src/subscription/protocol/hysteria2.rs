use super::parser_common::endpoint_from_raw;
use super::ProtocolParser;
use crate::error::AppError;
use crate::models::{Endpoint, RawProxyNode};

pub struct Hysteria2Parser;

impl ProtocolParser for Hysteria2Parser {
    fn protocol_key(&self) -> &'static str {
        "hysteria2"
    }

    fn parse(&self, raw: &RawProxyNode, source_id: &str) -> Result<Endpoint, AppError> {
        endpoint_from_raw(raw, source_id)
    }
}
