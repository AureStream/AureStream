//! [`RuntimeProfile`] → Mihomo YAML（骨架）。
//!
//! 下一步：将 [`crate::models::Endpoint`] 映射为 Mihomo `proxies:` 条目，并与 selector / rules 对齐。

use serde_yaml::{Mapping, Value};

use crate::error::AppError;
use crate::models::{RoutingMode, RuntimeProfile};

use super::constants::DEFAULT_EXTERNAL_CONTROLLER;

/// 与历史 `builtin_config` / 插件约定一致的默认 selector 名，便于前端与 REST 切换节点。
pub const AURESTREAM_NODE_SELECTOR: &str = "AureStream_Node_Selector";

pub fn runtime_profile_to_yaml(profile: &RuntimeProfile) -> Result<String, AppError> {
    let mut root = Mapping::new();

    root.insert(
        Value::String("bind-address".into()),
        Value::String(profile.listen.clone()),
    );
    root.insert(
        Value::String("mixed-port".into()),
        Value::Number(profile.mixed_port.into()),
    );
    root.insert(Value::String("ipv6".into()), Value::Bool(false));

    let mode = match profile.policy.routing_mode {
        RoutingMode::RuleBased => "rule",
        RoutingMode::FullTunnel => "global",
        RoutingMode::Direct => "direct",
    };
    root.insert(
        Value::String("mode".into()),
        Value::String(mode.into()),
    );

    root.insert(
        Value::String("log-level".into()),
        Value::String("info".into()),
    );
    root.insert(Value::String("allow-lan".into()), Value::Bool(false));
    root.insert(
        Value::String("external-controller".into()),
        Value::String(DEFAULT_EXTERNAL_CONTROLLER.into()),
    );
    root.insert(Value::String("secret".into()), Value::String(String::new()));

    // TODO: 由 Endpoint 列表生成真实 proxies；当前保证内核可启动的最小集合。
    let mut proxies = Vec::new();
    let mut direct = Mapping::new();
    direct.insert(Value::String("name".into()), Value::String("DIRECT".into()));
    direct.insert(Value::String("type".into()), Value::String("direct".into()));
    proxies.push(Value::Mapping(direct));

    root.insert(Value::String("proxies".into()), Value::Sequence(proxies));

    let mut group = Mapping::new();
    group.insert(
        Value::String("name".into()),
        Value::String(AURESTREAM_NODE_SELECTOR.into()),
    );
    group.insert(Value::String("type".into()), Value::String("select".into()));
    let proxies_names = vec![Value::String("DIRECT".into())];
    group.insert(Value::String("proxies".into()), Value::Sequence(proxies_names));

    root.insert(
        Value::String("proxy-groups".into()),
        Value::Sequence(vec![Value::Mapping(group)]),
    );

    let rules = vec![Value::String(format!("MATCH,{AURESTREAM_NODE_SELECTOR}"))];
    root.insert(Value::String("rules".into()), Value::Sequence(rules));

    let yaml = serde_yaml::to_string(&Value::Mapping(root))?;
    Ok(yaml)
}
