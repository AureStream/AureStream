use super::parser_common::endpoint_from_raw;
use super::ProtocolParser;
use crate::error::AppError;
use crate::models::{Endpoint, RawProxyNode};

pub struct HttpProxyParser;

impl ProtocolParser for HttpProxyParser {
    fn protocol_key(&self) -> &'static str {
        "http"
    }

    fn parse(&self, raw: &RawProxyNode, source_id: &str) -> Result<Endpoint, AppError> {
        endpoint_from_raw(raw, source_id)
    }
}
