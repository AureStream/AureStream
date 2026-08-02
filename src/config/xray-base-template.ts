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
 * IPv4 space minus RFC1918 private ranges (10/8, 172.16/12, 192.168/16),
 * loopback (127/8), and link-local (169.254/16) — i.e. "route everything
 * except the LAN" for `autoSystemRoutingTable`, so default (non-bypass-
 * router) TUN mode doesn't pull LAN-destined traffic (printers, routers,
 * local NAS, mDNS) into the tunnel. Xray's own `geoip:private -> direct`
 * routing rule (`buildRoutingRules`) would still send such traffic direct
 * even without this, but capturing it at the OS routing level too avoids an
 * unnecessary TUN hop and is closer to the old sing-box `route_exclude_address`
 * default.
 *
 * Generated with (Python's `ipaddress`, exact complement, not hand-picked):
 *   ipaddress.ip_network("0.0.0.0/0") minus
 *   {10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, 169.254.0.0/16}
 */
const IPV4_EXCLUDING_LAN: string[] = [
  "0.0.0.0/5", "8.0.0.0/7", "11.0.0.0/8", "12.0.0.0/6", "16.0.0.0/4",
  "32.0.0.0/3", "64.0.0.0/3", "96.0.0.0/4", "112.0.0.0/5", "120.0.0.0/6",
  "124.0.0.0/7", "126.0.0.0/8", "128.0.0.0/3", "160.0.0.0/5", "168.0.0.0/8",
  "169.0.0.0/9", "169.128.0.0/10", "169.192.0.0/11", "169.224.0.0/12",
  "169.240.0.0/13", "169.248.0.0/14", "169.252.0.0/15", "169.255.0.0/16",
  "170.0.0.0/7", "172.0.0.0/12", "172.32.0.0/11", "172.64.0.0/10",
  "172.128.0.0/9", "173.0.0.0/8", "174.0.0.0/7", "176.0.0.0/4", "192.0.0.0/9",
  "192.128.0.0/11", "192.160.0.0/13", "192.169.0.0/16", "192.170.0.0/15",
  "192.172.0.0/14", "192.176.0.0/12", "192.192.0.0/10", "193.0.0.0/8",
  "194.0.0.0/7", "196.0.0.0/6", "200.0.0.0/5", "208.0.0.0/4", "224.0.0.0/3",
]

/**
 * `tun` inbound. Present only when `tun` is requested — unlike the sing-box
 * template (which kept both inbounds always defined and toggled capture via
 * `auto_route`), Xray has no hot-reload, so every mode switch is already a
 * full stop+respawn — there's no fast-switch benefit to keeping an inactive
 * tun inbound around.
 *
 * @param bypassRouter Mirrors the old sing-box `route_exclude_address`
 * toggle: normally LAN ranges are excluded from the tunnel (protects the
 * user's own local network); bypass-router mode (this device acting as a
 * gateway for other LAN devices) captures everything instead, since the
 * whole point is proxying LAN-sourced traffic too. IP forwarding itself is
 * enabled separately on the Rust side (`start_tun_via_helper`).
 *
 * IPv6 is not split the same way (always `::/0`) — IPv6 LAN usage (ULA/
 * link-local) is rare enough in practice that this is a known simplification;
 * Xray's own `geoip:private -> direct` rule still routes it correctly, just
 * via an extra TUN hop instead of being excluded at the OS routing level.
 */
function buildTunInbound(bypassRouter: boolean): Record<string, unknown> {
  return {
    tag: "tun-in",
    protocol: "tun",
    settings: {
      name: TUN_INTERFACE_NAME,
      mtu: 1500,
      gateway: [TUN_GATEWAY_CIDR],
      autoSystemRoutingTable: bypassRouter
        ? ["0.0.0.0/0", "::/0"]
        : [...IPV4_EXCLUDING_LAN, "::/0"],
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
 * @param bypassRouter Only meaningful when `tun` is true — see `buildTunInbound`.
 */
export function buildBaseXrayConfig(
  global: boolean,
  tun: boolean,
  bypassRouter: boolean = false
): Record<string, any> {
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
    inbounds.push(buildTunInbound(bypassRouter))
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
      // Inbound counters (not outbound) give total app traffic in one query
      // regardless of how many subscription nodes exist — see engine/xray_api.rs.
      system: {
        statsInboundUplink: true,
        statsInboundDownlink: true,
        statsOutboundUplink: true,
        statsOutboundDownlink: true,
      },
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
