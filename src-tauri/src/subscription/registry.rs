use std::collections::HashMap;

use crate::error::AppError;
use crate::models::{Endpoint, RawProxyNode};

use super::format::{ClashYamlParser, FormatParser, V2rayBase64Parser};
use super::protocol::{
    HttpProxyParser, Hysteria2Parser, ProtocolParser, ShadowsocksParser, Socks5Parser,
    TrojanParser, TuicParser, VlessParser, VmessParser,
};


/// 格式解析器 + 协议解析器注册表（静态 Phase 1）。
pub struct ParserRegistry {
    formats: Vec<Box<dyn FormatParser>>,
    protocols: HashMap<String, Box<dyn ProtocolParser>>,
}

impl Default for ParserRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl ParserRegistry {
    pub fn new() -> Self {
        let mut protocols: HashMap<String, Box<dyn ProtocolParser>> = HashMap::new();
        let register = |m: &mut HashMap<String, Box<dyn ProtocolParser>>, p: Box<dyn ProtocolParser>| {
            m.insert(p.protocol_key().to_string(), p);
        };
        register(&mut protocols, Box::new(VmessParser));
        register(&mut protocols, Box::new(VlessParser));
        register(&mut protocols, Box::new(ShadowsocksParser));
        register(&mut protocols, Box::new(TrojanParser));
        register(&mut protocols, Box::new(Socks5Parser));
        register(&mut protocols, Box::new(HttpProxyParser));
        register(&mut protocols, Box::new(TuicParser));
        register(&mut protocols, Box::new(Hysteria2Parser));

        Self {
            formats: vec![
                Box::new(ClashYamlParser),
                Box::new(V2rayBase64Parser),
            ],
            protocols,
        }
    }

    pub fn register_format(&mut self, p: Box<dyn FormatParser>) {
        self.formats.push(p);
    }

    pub fn register_protocol(&mut self, p: Box<dyn ProtocolParser>) {
        self.protocols.insert(p.protocol_key().to_string(), p);
    }

    /// 自动检测格式 → RawProxyNode[]
    pub fn parse_raw_nodes(&self, content: &[u8], source_id: &str) -> Result<Vec<RawProxyNode>, AppError> {
        let mut last_err: Option<AppError> = None;
        let mut any_match = false;
        for f in &self.formats {
            if !f.can_parse(content) {
                continue;
            }
            any_match = true;
            tracing::debug!(format = f.name(), "尝试格式解析器");
            match f.parse(content, source_id) {
                Ok(nodes) => return Ok(nodes),
                Err(e) => last_err = Some(e),
            }
        }
        if any_match {
            Err(last_err.unwrap_or(AppError::UnknownFormat))
        } else {
            Err(AppError::UnknownFormat)
        }
    }

    /// RawProxyNode → Endpoint（按 `RawProxyNode.protocol` 分发）
    pub fn raw_to_endpoint(&self, raw: &RawProxyNode, source_id: &str) -> Result<Endpoint, AppError> {
        let key = raw.protocol.as_str();
        let parser = self
            .protocols
            .get(key)
            .ok_or_else(|| AppError::protocol(key, "未注册协议解析器"))?;
        parser.parse(raw, source_id)
    }

    /// 两阶段合一：内容 → Endpoint 列表（任一节点解析失败则返回 Err）
    pub fn parse_subscription(&self, content: &[u8], source_id: &str) -> Result<Vec<Endpoint>, AppError> {
        let raws = self.parse_raw_nodes(content, source_id)?;
        let mut out = Vec::with_capacity(raws.len());
        for r in &raws {
            out.push(self.raw_to_endpoint(r, source_id)?);
        }
        Ok(out)
    }

    /// 订阅字节 → Endpoint：格式无法识别返回空；单节点失败跳过。
    /// 自动执行：Normalizer（地区推测）→ Deduplicator（unique_hash 去重）。
    pub fn ingest_subscription_bytes(&self, content: &[u8], source_id: &str) -> Vec<Endpoint> {
        let raws = match self.parse_raw_nodes(content, source_id) {
            Ok(v) => v,
            Err(e) => {
                tracing::warn!(error = %e, source_id = %source_id, "订阅格式无法识别");
                return Vec::new();
            }
        };
        let mut out = Vec::with_capacity(raws.len());
        for raw in raws {
            match self.raw_to_endpoint(&raw, source_id) {
                Ok(mut ep) => {
                    super::normalizer::normalize_endpoint(&mut ep);
                    out.push(ep);
                }
                Err(e) => tracing::warn!(name = %raw.canonical.name, error = %e, "跳过节点"),
            }
        }
        super::deduplicator::dedup_endpoints(out)
    }
}

impl ParserRegistry {
    /// 测试/调试：是否识别为已知格式
    pub fn detect_format_name(&self, content: &[u8]) -> Option<&'static str> {
        self.formats
            .iter()
            .find(|f| f.can_parse(content))
            .map(|f| f.name())
    }
}
