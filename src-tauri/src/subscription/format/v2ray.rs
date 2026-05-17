use super::FormatParser;
use crate::error::AppError;

/// V2Ray VMess/VLESS 等 Base64 订阅（待实现）
pub struct V2rayBase64Parser;

impl FormatParser for V2rayBase64Parser {
    fn name(&self) -> &'static str {
        "v2ray_base64"
    }

    fn can_parse(&self, content: &[u8]) -> bool {
        let Ok(s) = std::str::from_utf8(content) else {
            return false;
        };
        let t = s.trim();
        if t.lines().count() > 4 {
            // 多行文本默认更像节点列表；但与 Clash YAML 冲突时由注册表中 Clash 优先处理。
            return false;
        }
        t.starts_with("vmess://")
            || t.starts_with("vless://")
            || t.starts_with("trojan://")
            || t.starts_with("ss://")
    }

    fn parse(&self, _content: &[u8], _source_id: &str) -> Result<Vec<crate::models::RawProxyNode>, AppError> {
        Err(AppError::protocol(
            "v2ray",
            "V2rayBase64Parser::parse 尚未实现：请填充 URI → RawProxyNode",
        ))
    }
}
