// Local base config skeleton for Xray-core, System Proxy mode.
//
// Unlike the sing-box-era merger, this is NOT fetched from a remote URL —
// everything the merger needs is either in this file or filled in from
// settings/subscription data. Schema verified against XTLS/Xray-core source
// (infra/conf/{router,dns}.go) for `routing.rules`/`balancers` and `dns.servers`.
//
// TUN mode (`protocol: "tun"` inbound) is intentionally not built here yet —
// Xray-core's native TUN support is a separate, not-yet-implemented phase.

/** Domestic (CN) traffic goes direct; everything else falls through to the balancer. */
export function buildRoutingRules(): Record<string, unknown>[] {
  return [
    { type: "field", ip: ["geoip:private"], outboundTag: "direct" },
    { type: "field", domain: ["geosite:cn"], outboundTag: "direct" },
    { type: "field", ip: ["geoip:cn"], outboundTag: "direct" },
    { type: "field", domain: ["geosite:category-ads-all"], outboundTag: "block" },
  ]
}

/**
 * @param global When true ("全局模式"), skip the CN-direct/ads-block rules so
 * all traffic falls through to the proxy balancer. When false ("规则模式"),
 * domestic traffic and ads are routed away from the balancer.
 */
export function buildBaseXrayConfig(global: boolean): Record<string, any> {
  return {
    log: { loglevel: "warning" },
    api: {
      tag: "api",
      listen: "127.0.0.1:9191",
      services: ["HandlerService", "LoggerService", "StatsService", "RoutingService"],
    },
    stats: {},
    policy: {
      system: { statsOutboundUplink: true, statsOutboundDownlink: true },
    },
    dns: {
      servers: ["223.5.5.5", "8.8.8.8"],
    },
    inbounds: [
      {
        tag: "mixed-in",
        listen: "127.0.0.1",
        port: 2345,
        protocol: "socks",
        settings: { auth: "noauth", udp: true },
        sniffing: { enabled: true, destOverride: ["http", "tls"] },
      },
    ],
    outbounds: [
      { tag: "direct", protocol: "freedom" },
      { tag: "block", protocol: "blackhole" },
    ],
    routing: {
      domainStrategy: "IPIfNonMatch",
      rules: global ? [] : buildRoutingRules(),
      balancers: [] as Record<string, unknown>[],
    },
  }
}
