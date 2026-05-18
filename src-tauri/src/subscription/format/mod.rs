mod clash;
mod v2ray;

pub use clash::ClashYamlParser;
pub use v2ray::V2rayBase64Parser;

use crate::error::AppError;
use crate::models::RawProxyNode;

pub trait FormatParser: Send + Sync {
    fn name(&self) -> &'static str;
    fn can_parse(&self, content: &[u8]) -> bool;
    fn parse(&self, content: &[u8], source_id: &str) -> Result<Vec<RawProxyNode>, AppError>;
}
