//! 内置 Clash/Mihomo 运行时配置：`proxy-providers` 使用本地 YAML（type: file）+ 固定规则与单一 Selector。
//! Mihomo 要求 `path` 必须位于 `-d` 工作目录（及其 SAFE_PATHS）之下，因此从应用配置目录的订阅文件**复制**到 `mihomo-work/subscriptions/` 再写入配置。

use super::allocate_high_random_port;
use super::mihomo_constants::{
    AURESTREAM_NODE_SELECTOR, EXTERNAL_CONTROLLER, GEODATA, LATENCY_TEST_URL,
};
use super::proxy::ProxyState;
use serde_yaml::{Mapping, Value};
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};

const PROXY_PROVIDER_KEY: &str = "AureStream_Sub";

fn build_config_value(subscription_file_absolute: &str, listen: &str, mixed_port: u16) -> Value {
    let mut root = Mapping::new();
    root.insert(
        Value::String("bind-address".to_string()),
        Value::String(listen.to_string()),
    );
    root.insert(
        Value::String("mixed-port".to_string()),
        Value::Number(mixed_port.into()),
    );
    root.insert(Value::String("ipv6".to_string()), Value::Bool(false));
    root.insert(
        Value::String("mode".to_string()),
        Value::String("rule".to_string()),
    );
    root.insert(
        Value::String("log-level".to_string()),
        Value::String("info".to_string()),
    );
    root.insert(Value::String("allow-lan".to_string()), Value::Bool(false));
    root.insert(
        Value::String("external-controller".to_string()),
        Value::String(EXTERNAL_CONTROLLER.to_string()),
    );
    root.insert(
        Value::String("secret".to_string()),
        Value::String(String::new()),
    );

    let mut geox_url = Mapping::new();
    for entry in GEODATA {
        geox_url.insert(
            Value::String(entry.geox_key.to_string()),
            Value::String(entry.url.to_string()),
        );
    }
    root.insert(
        Value::String("geox-url".to_string()),
        Value::Mapping(geox_url),
    );

    let mut hc = Mapping::new();
    hc.insert(Value::String("enable".to_string()), Value::Bool(true));
    hc.insert(
        Value::String("interval".to_string()),
        Value::Number(300.into()),
    );
    hc.insert(
        Value::String("url".to_string()),
        Value::String(LATENCY_TEST_URL.to_string()),
    );

    let mut prov = Mapping::new();
    prov.insert(
        Value::String("type".to_string()),
        Value::String("file".to_string()),
    );
    prov.insert(
        Value::String("path".to_string()),
        Value::String(subscription_file_absolute.to_string()),
    );
    prov.insert(
        Value::String("interval".to_string()),
        Value::Number(3600.into()),
    );
    prov.insert(
        Value::String("health-check".to_string()),
        Value::Mapping(hc),
    );

    let mut providers = Mapping::new();
    providers.insert(
        Value::String(PROXY_PROVIDER_KEY.to_string()),
        Value::Mapping(prov),
    );
    root.insert(
        Value::String("proxy-providers".to_string()),
        Value::Mapping(providers),
    );

    let mut group = Mapping::new();
    group.insert(
        Value::String("name".to_string()),
        Value::String(AURESTREAM_NODE_SELECTOR.to_string()),
    );
    group.insert(
        Value::String("type".to_string()),
        Value::String("select".to_string()),
    );
    group.insert(
        Value::String("use".to_string()),
        Value::Sequence(vec![Value::String(PROXY_PROVIDER_KEY.to_string())]),
    );
    root.insert(
        Value::String("proxy-groups".to_string()),
        Value::Sequence(vec![Value::Mapping(group)]),
    );

    let rules_vec: Vec<String> = vec![
        // 本机环回必须直连：开发服务、本机 HTTP（含 :80）等需能访问；无进程监听时仍会 connection refused，属正常。
        "DOMAIN,localhost,DIRECT".to_string(),
        "IP-CIDR,127.0.0.0/8,DIRECT,no-resolve".to_string(),
        "GEOIP,private,DIRECT".to_string(),
        "GEOIP,CN,DIRECT".to_string(),
        "GEOSITE,cn,DIRECT".to_string(),
        format!("MATCH,{}", AURESTREAM_NODE_SELECTOR),
    ];
    root.insert(
        Value::String("rules".to_string()),
        Value::Sequence(rules_vec.into_iter().map(Value::String).collect()),
    );

    Value::Mapping(root)
}

/// 写入 `runtime/aurestream-mihomo.yaml`：`proxy-providers.type: file` 的 `path` 为 **`mihomo-work/subscriptions/<provider_id>.yaml`**（内核 `-d` 下，符合 SAFE_PATH）。
/// 数据源仍为应用配置目录下 `subscriptions/<provider_id>.yaml`（按 `download_subscription` 写入），此处每次生成配置时做一次复制以同步最新内容。
#[tauri::command]
pub async fn build_runtime_config(
    app: AppHandle,
    provider_id: String,
    proxy_state: State<'_, ProxyState>,
) -> Result<String, String> {
    let (listen, mixed_port) = {
        let mut config = proxy_state.config.lock().map_err(|e| e.to_string())?;
        let status = proxy_state.status.lock().map_err(|e| e.to_string())?;
        config.listen = super::mihomo_constants::DEFAULT_LISTEN_ADDR.to_string();
        if !status.is_running || config.mixed_port == 0 {
            config.mixed_port = allocate_high_random_port()?;
        }
        (config.listen.clone(), config.mixed_port)
    };

    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("无法获取应用配置目录: {}", e))?;

    let src = config_dir
        .join("subscriptions")
        .join(format!("{}.yaml", provider_id));

    if !src.is_file() {
        return Err("订阅本地配置文件不存在，请先在服务商页更新订阅".to_string());
    }

    let work_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("无法获取本地数据目录: {}", e))?
        .join(super::mihomo_constants::MIHOMO_WORK_DIR);
    let mirrored_subscriptions = work_dir.join("subscriptions");
    tokio::fs::create_dir_all(&mirrored_subscriptions)
        .await
        .map_err(|e| format!("创建工作目录 subscriptions 镜像失败: {}", e))?;

    let dest = mirrored_subscriptions.join(format!("{}.yaml", provider_id));
    tokio::fs::copy(&src, &dest)
        .await
        .map_err(|e| format!("同步订阅文件到 mihomo-work 失败: {}", e))?;

    let absolute = dest
        .canonicalize()
        .map_err(|e| format!("无法解析 mihomo-work 内订阅路径: {}", e))?;
    // Windows canonicalize() 会加 \\?\ 前缀，mihomo 不识别，需去掉
    let abs_str = absolute
        .to_string_lossy()
        .strip_prefix("\\\\?\\")
        .map(|s| s.to_string())
        .unwrap_or_else(|| absolute.to_string_lossy().to_string());

    let yaml_value = build_config_value(&abs_str, &listen, mixed_port);

    let text =
        serde_yaml::to_string(&yaml_value).map_err(|e| format!("序列化内置配置失败: {}", e))?;

    let runtime_dir = config_dir.join("runtime");
    tokio::fs::create_dir_all(&runtime_dir)
        .await
        .map_err(|e| format!("创建 runtime 目录失败: {}", e))?;

    let out: PathBuf = runtime_dir.join("aurestream-mihomo.yaml");
    tokio::fs::write(&out, text.as_bytes())
        .await
        .map_err(|e| format!("写入运行配置失败: {}", e))?;

    Ok(out.to_string_lossy().to_string())
}
