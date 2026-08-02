import { TUN_INTERFACE_NAME } from "../types/definition";

// Local base config skeleton for Xray-core (System Proxy + TUN modes).
//
// Unlike the sing-box-era merger, this is NOT fetched from a remote URL —
// everything the merger needs is either in this file or filled in from
// settings/subscription data. Schema verified against XTLS/Xray-core source
// (infra/conf/{router,dns,tun}.go) for `routing.rules`/`balancers`,
// `dns.servers`, and the `tun` inbound's `settings.{name,mtu,gateway,
// autoSystemRoutingTable}`.

/** Domestic (CN) traffic goes direct; everything else falls through to the balancer. */
export function buildRoutingRules(): Record<string, unknown>[] {
  return [
    { type: "field", ip: ["geoip:private"], outboundTag: "direct" },
    { type: "field", domain: ["geosite:cn"], outboundTag: "direct" },
    { type: "field", ip: ["geoip:cn"], outboundTag: "direct" },
    { type: "field", domain: ["geosite:category-ads-all"], outboundTag: "block" },
  ]
}

/** IPv4 gateway Xray assigns to the TUN interface (point-to-point prefix). */
export const TUN_GATEWAY_CIDR = "172.19.0.1/30"

/**
 * `tun` inbound. Present only when `tun` is requested — unlike the sing-box
 * template (which kept both inbounds always defined and toggled capture via
 * `auto_route`), Xray has no hot-reload, so every mode switch is already a
 * full stop+respawn — there's no fast-switch benefit to keeping an inactive
 * tun inbound around.
 *
 * NOTE: bypass-router (旁路由) LAN-range route exclusion, which the
 * sing-box template supported via `route_exclude_address`, is not
 * replicated here — `autoSystemRoutingTable` always routes the full
 * 0.0.0.0/0 + ::/0 through the tunnel. Follow-up if bypass-router mode is
 * needed on Xray.
 */
function buildTunInbound(): Record<string, unknown> {
  return {
    tag: "tun-in",
    protocol: "tun",
    settings: {
      name: TUN_INTERFACE_NAME,
      mtu: 1500,
      gateway: [TUN_GATEWAY_CIDR],
      autoSystemRoutingTable: ["0.0.0.0/0", "::/0"],
    },
    sniffing: { enabled: true, destOverride: ["http", "tls"] },
  }
}

/**
 * @param global When true ("全局模式"), skip the CN-direct/ads-block rules so
 * all traffic falls through to the proxy balancer. When false ("规则模式"),
 * domestic traffic and ads are routed away from the balancer.
 * @param tun When true, add the `tun` inbound (虚拟网卡模式) alongside the
 * local SOCKS inbound.
 */
export function buildBaseXrayConfig(global: boolean, tun: boolean): Record<string, any> {
  const inbounds: Record<string, unknown>[] = [
    {
      tag: "mixed-in",
      listen: "127.0.0.1",
      port: 2345,
      protocol: "socks",
      settings: { auth: "noauth", udp: true },
      sniffing: { enabled: true, destOverride: ["http", "tls"] },
    },
  ]
  if (tun) {
    inbounds.push(buildTunInbound())
  }

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
    inbounds,
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
