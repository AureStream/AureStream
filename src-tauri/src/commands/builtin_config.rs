//! 内置 Clash/Mihomo 运行时配置：`proxy-providers` 使用本地 YAML（type: file）+ 固定规则与单一 Selector。
//! Mihomo 将 `proxy-providers.path` 限制在 `-d`（home）及 SAFE_PATHS 之下；YAML 内使用**相对于 `-d` 的路径**
//! （如 `subscriptions/<id>.yaml`），并与侧进程传入的 `-d`（`app_local_data_dir()/mihomo-work`）一致，
//! 避免 Windows 上使用绝对规范化路径与用户目录推导不一致而导致 fatal。
//! 数据源仍在应用配置目录 `subscriptions/` 下，生成运行配置时会复制到 `mihomo-work/subscriptions/`。

use super::mihomo_constants::{
    AURESTREAM_NODE_SELECTOR, DEFAULT_MIXED_PORT, EXTERNAL_CONTROLLER, GEODATA, LATENCY_TEST_URL,
};
use super::proxy::ProxyState;
use serde_yaml::{Mapping, Value};
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};

const PROXY_PROVIDER_KEY: &str = "AureStream_Sub";

fn build_config_value(subscription_path_relative_home: &str, listen: &str, mixed_port: u16) -> Value {
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
        Value::String(subscription_path_relative_home.to_string()),
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

/// 写入 `runtime/aurestream-mihomo.yaml`：`proxy-providers.type: file` 的 `path` 为相对 `-d` 的 **`subscriptions/<provider_id>.yaml`**（实体文件位于 `.../mihomo-work/subscriptions/`）。
/// 数据源为应用配置目录下 `subscriptions/<provider_id>.yaml`；每次生成时复制到镜像目录以同步内容。
#[tauri::command]
pub async fn build_runtime_config(
    app: AppHandle,
    provider_id: String,
    proxy_state: State<'_, ProxyState>,
) -> Result<String, String> {
    let (listen, mixed_port) = {
        let mut config = proxy_state.config.lock().map_err(|e| e.to_string())?;
        config.listen = super::mihomo_constants::DEFAULT_LISTEN_ADDR.to_string();
        if config.mixed_port == 0 {
            config.mixed_port = DEFAULT_MIXED_PORT;
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

    let rel_path = format!("subscriptions/{provider_id}.yaml");
    let yaml_value = build_config_value(&rel_path, &listen, mixed_port);

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
