/** 与内核 health-check / delayGroup 及 Rust `mihomo_constants::LATENCY_TEST_URL` 一致 */
export const MIHOMO_LATENCY_TEST_URL =
  "https://www.gstatic.com/generate_204" as const;

/** 离线 Rust TCP 侧与 HTTPS generate_204 对齐 */
export const MIHOMO_LATENCY_TEST_TCP_HOST = "www.gstatic.com" as const;
export const MIHOMO_LATENCY_TEST_TCP_PORT = 443 as const;

/** 与后端 `builtin_config::AURESTREAM_NODE_SELECTOR` 一致；选节点时传给 selectNodeForGroup */
export const AURESTREAM_NODE_SELECTOR = "AureStream_Node_Selector";

/** 系统代理排除列表（Settings 默认值，逗号分隔） */
export const DEFAULT_PROXY_BYPASS_DOMAINS =
  "localhost,127.*,10.*,172.16.*,172.17.*,172.18.*,172.19.*,172.20.*,172.21.*,172.22.*,172.23.*,172.24.*,172.25.*,172.26.*,172.27.*,172.28.*,172.29.*,172.30.*,172.31.*,192.168.*,<local>";
