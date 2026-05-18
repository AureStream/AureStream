//! Mihomo 内核共享常量（单一数据源）。

/// HTTPS 204，避免纯 HTTP 80 在部分网络/hosts 下误指向本机并刷 `localhost:80` 告警。
pub const LATENCY_TEST_URL: &str = "https://www.gstatic.com/generate_204";

/// 与插件约定一致的默认 selector 名，便于前端与 REST 切换节点。
pub const AURESTREAM_NODE_SELECTOR: &str = "AureStream_Node_Selector";

/// Mihomo External Controller 地址。
pub const EXTERNAL_CONTROLLER: &str = "127.0.0.1:9090";

/// 本地回环监听地址。
pub const DEFAULT_LISTEN_ADDR: &str = "127.0.0.1";

/// Mihomo 运行时工作目录名。
pub const MIHOMO_WORK_DIR: &str = "mihomo-work";

/// GeoIP/GeoSite 规则数据库条目（用于 Mihomo `geox-url` 配置）。
pub struct GeodataEntry {
    /// Mihomo `geox-url` 配置中的 key
    pub geox_key: &'static str,
    /// 下载 URL
    pub url: &'static str,
}

/// GeoIP/GeoSite 规则数据库（单一数据源）。
pub const GEODATA: &[GeodataEntry] = &[
    GeodataEntry {
        geox_key: "geoip-lite",
        url: "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geoip-lite.db",
    },
    GeodataEntry {
        geox_key: "mmdb",
        url: "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/country-lite.mmdb",
    },
    GeodataEntry {
        geox_key: "geosite",
        url: "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geosite-lite.dat",
    },
];
