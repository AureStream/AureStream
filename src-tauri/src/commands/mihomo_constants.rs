//! Mihomo health-check / 延迟测试默认值，与前端 `src/constants/mihomo.ts` 对齐。

/// HTTPS 204，避免纯 HTTP 80 在部分网络/hosts 下误指向本机并刷 `localhost:80` 告警。
pub const LATENCY_TEST_URL: &str = "https://www.gstatic.com/generate_204";
pub const LATENCY_TEST_TCP_HOST: &str = "www.gstatic.com";
pub const LATENCY_TEST_TCP_PORT: u16 = 443;
