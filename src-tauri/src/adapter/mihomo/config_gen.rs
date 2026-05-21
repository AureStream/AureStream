//! [`RuntimeProfile`] → Mihomo 完整 YAML 配置。
//!
//! 合并原 `commands/builtin_config.rs` 逻辑：proxy-providers（file 类型）+ geox-url + health-check + routing rules。

use serde_yaml::{Mapping, Value};
use std::path::PathBuf;

use crate::error::AppError;
use crate::models::{RoutingMode, RuntimeProfile};

use super::constants::{AURESTREAM_NODE_SELECTOR, EXTERNAL_CONTROLLER, GEODATA, LATENCY_TEST_URL};

const PROXY_PROVIDER_KEY: &str = "AureStream_Sub";

/// 生成完整的 Mihomo YAML 配置。
///
/// - `subscription_path_relative_home`: **相对** Mihomo `-d`（工作目录）的路径，通常为 `subscriptions/<provider_id>.yaml`。
///   使用绝对路径在 Windows 上易与 Mihomo SAFE_PATH（用户目录规范化）不一致并报 fatal；相对路径与各平台一致解析。
/// - `profile`: 运行时配置（listen、mixed_port、routing_mode 等）
pub fn generate_full_config(
    subscription_path_relative_home: &str,
    profile: &RuntimeProfile,
) -> Result<String, AppError> {
    let mut root = Mapping::new();

    // 基础配置
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
        Value::String(EXTERNAL_CONTROLLER.into()),
    );
    root.insert(Value::String("secret".into()), Value::String(String::new()));

    // geox-url（GeoIP/GeoSite 规则数据库）
    let mut geox_url = Mapping::new();
    for entry in GEODATA {
        geox_url.insert(
            Value::String(entry.geox_key.to_string()),
            Value::String(entry.url.to_string()),
        );
    }
    root.insert(
        Value::String("geox-url".into()),
        Value::Mapping(geox_url),
    );

    // proxy-providers（file 类型，指向本地订阅文件）
    let mut hc = Mapping::new();
    hc.insert(Value::String("enable".into()), Value::Bool(true));
    hc.insert(Value::String("interval".into()), Value::Number(300.into()));
    hc.insert(
        Value::String("url".into()),
        Value::String(LATENCY_TEST_URL.into()),
    );

    let mut prov = Mapping::new();
    prov.insert(Value::String("type".into()), Value::String("file".into()));
    prov.insert(
        Value::String("path".into()),
        Value::String(subscription_path_relative_home.to_string()),
    );
    prov.insert(Value::String("interval".into()), Value::Number(3600.into()));
    prov.insert(Value::String("health-check".into()), Value::Mapping(hc));

    let mut providers = Mapping::new();
    providers.insert(
        Value::String(PROXY_PROVIDER_KEY.into()),
        Value::Mapping(prov),
    );
    root.insert(
        Value::String("proxy-providers".into()),
        Value::Mapping(providers),
    );

    // proxy-groups（单一 selector，使用 proxy-provider）
    let mut group = Mapping::new();
    group.insert(
        Value::String("name".into()),
        Value::String(AURESTREAM_NODE_SELECTOR.into()),
    );
    group.insert(Value::String("type".into()), Value::String("select".into()));
    group.insert(
        Value::String("use".into()),
        Value::Sequence(vec![Value::String(PROXY_PROVIDER_KEY.into())]),
    );
    root.insert(
        Value::String("proxy-groups".into()),
        Value::Sequence(vec![Value::Mapping(group)]),
    );

    // rules
    let rules_vec: Vec<String> = vec![
        "DOMAIN,localhost,DIRECT".into(),
        "IP-CIDR,127.0.0.0/8,DIRECT,no-resolve".into(),
        "GEOIP,private,DIRECT".into(),
        "GEOIP,CN,DIRECT".into(),
        "GEOSITE,cn,DIRECT".into(),
        format!("MATCH,{}", AURESTREAM_NODE_SELECTOR),
    ];
    root.insert(
        Value::String("rules".into()),
        Value::Sequence(rules_vec.into_iter().map(Value::String).collect()),
    );

    serde_yaml::to_string(&Value::Mapping(root)).map_err(AppError::Yaml)
}

/// 将订阅文件复制到 `work_dir/subscriptions/<provider_id>.yaml`，并返回**相对 `-d`** 的路径字符串。
///
/// Mihomo 将 `proxy-providers.path` 限制在 home（`-d`）及 SAFE_PATHS 下；使用相对路径避免 Windows 上与绝对规范化路径不匹配。
pub async fn mirror_subscription_to_workdir(
    src: &std::path::Path,
    work_dir: &PathBuf,
    provider_id: &str,
) -> Result<String, AppError> {
    let mirrored = work_dir.join("subscriptions");
    tokio::fs::create_dir_all(&mirrored)
        .await
        .map_err(AppError::Io)?;

    let dest = mirrored.join(format!("{}.yaml", provider_id));
    tokio::fs::copy(src, &dest)
        .await
        .map_err(AppError::Io)?;

    tokio::fs::metadata(&dest).await.map_err(AppError::Io)?;

    Ok(format!("subscriptions/{provider_id}.yaml"))
}
