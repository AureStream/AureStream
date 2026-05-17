mod shadowsocks;
mod trojan;
mod vless;
mod vmess;
mod socks5;
mod http_proxy;
mod tuic;
mod hysteria2;
mod parser_common;

pub use shadowsocks::ShadowsocksParser;
pub use trojan::TrojanParser;
pub use vless::VlessParser;
pub use vmess::VmessParser;
pub use socks5::Socks5Parser;
pub use http_proxy::HttpProxyParser;
pub use tuic::TuicParser;
pub use hysteria2::Hysteria2Parser;

use crate::error::AppError;
use crate::models::{Endpoint, RawProxyNode};

pub trait ProtocolParser: Send + Sync {
    fn protocol_key(&self) -> &'static str;
    fn parse(&self, raw: &RawProxyNode, source_id: &str) -> Result<Endpoint, AppError>;
}
