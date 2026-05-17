//! Mihomo health-check URL（内置规则 / 内核侧），与前端说明对齐。

/// HTTPS 204，避免纯 HTTP 80 在部分网络/hosts 下误指向本机并刷 `localhost:80` 告警。
pub const LATENCY_TEST_URL: &str = "https://www.gstatic.com/generate_204";
