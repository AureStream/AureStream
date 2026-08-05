import { TUN_INTERFACE_NAME } from "../types/definition";

// Local base config skeleton for Xray-core (System Proxy + TUN modes).
//
// Unlike the sing-box-era merger, this is NOT fetched from a remote URL —
// everything the merger needs is either in this file or filled in from
// settings/subscription data. Schema verified against XTLS/Xray-core source
// (infra/conf/{router,dns,tun}.go) for `routing.rules`/`balancers`,
// `dns.servers`, and the `tun` inbound's `settings.{name,mtu,gateway,
// autoSystemRoutingTable}`.
//
// Rule-mode DNS follows XTLS "routing with DNS" example 1:
// https://xtls.github.io/document/level-1/routing-with-dns.html

/** Must match `PROXY_BALANCER_TAG` in merger/helper.ts (catch-all + DNS proxy). */
export const PROXY_BALANCER_TAG = "proxy-balancer"

export const DNS_DIRECT_TAG = "dns-direct"
export const DNS_PROXY_TAG = "dns-proxy"
/** Built-in DNS outbound — must handle OS DNS forced to the TUN gateway on Windows. */
export const DNS_OUT_TAG = "dns-out"

/** Fixed ECS client IP for CN CDN-friendly A/AAAA (no UI this iteration). */
export const ECS_CLIENT_IP = "222.85.85.85"

/**
 * Routing rules before the catch-all balancer rule (appended by the merger).
 *
 * Rule mode: DNS tag routing + IP-first CN split + ads block.
 * Global mode: DNS proxy tag + private LAN direct only.
 *
 * Port 53 is always first: Windows TUN service rewrites NIC NameServer to the
 * TUN gateway IP; without this rule those queries match `geoip:private →
 * direct` and never reach the DNS module, so the whole tunnel looks "up"
 * but nothing resolves.
 */
export function buildRoutingRules(global: boolean = false): Record<string, unknown>[] {
  const dnsCapture = {
    type: "field",
    port: "53",
    network: "udp,tcp",
    outboundTag: DNS_OUT_TAG,
  }
  // Drop link-local / NetBIOS broadcast noise that can flood TUN on Windows
  // (seen as tens of thousands of 169.254.x → :137/:138 → direct entries)
  // before private-IP direct rules. Does not affect real LAN RFC1918 traffic.
  const dropLinkLocalNoise = [
    {
      type: "field",
      ip: ["169.254.0.0/16", "fe80::/10"],
      outboundTag: "block",
    },
    {
      type: "field",
      port: "137,138",
      network: "udp",
      outboundTag: "block",
    },
  ]
  if (global) {
    return [
      dnsCapture,
      ...dropLinkLocalNoise,
      { type: "field", inboundTag: [DNS_PROXY_TAG], balancerTag: PROXY_BALANCER_TAG },
      { type: "field", ip: ["geoip:private"], outboundTag: "direct" },
    ]
  }
  return [
    dnsCapture,
    ...dropLinkLocalNoise,
    { type: "field", inboundTag: [DNS_DIRECT_TAG], outboundTag: "direct" },
    { type: "field", inboundTag: [DNS_PROXY_TAG], balancerTag: PROXY_BALANCER_TAG },
    { type: "field", ip: ["geoip:private"], outboundTag: "direct" },
    { type: "field", ip: ["geoip:cn"], outboundTag: "direct" },
    { type: "field", domain: ["geosite:category-ads-all"], outboundTag: "block" },
  ]
}

/**
 * Full DNS module config.
 * Rule: XTLS example 1 (google / cn / !cn / unknown + parallel).
 * Global: simple proxy-side resolvers tagged dns-proxy (no leak via direct).
 */
export function buildDnsConfig(
  global: boolean,
  enableIpv6: boolean = false,
): Record<string, unknown> {
  const queryStrategy = enableIpv6 ? "UseIP" : "UseIPv4"
  if (global) {
    return {
      servers: ["1.1.1.1", "8.8.8.8"],
      tag: DNS_PROXY_TAG,
      queryStrategy,
    }
  }
  return {
    tag: DNS_PROXY_TAG,
    enableParallelQuery: true,
    queryStrategy,
    servers: buildRuleDnsServers(),
  }
}

/** Doc example 1 server chain (order matters for fallback / finalQuery). */
export function buildRuleDnsServers(): unknown[] {
  return [
    // Google — always via proxy DNS (avoid CAPTCHA / CN monitoring on 3p embeds).
    {
      address: "1.1.1.1",
      skipFallback: true,
      domains: ["geosite:google", "geosite:google-cn"],
    },
    {
      address: "8.8.8.8",
      skipFallback: true,
      domains: ["geosite:google", "geosite:google-cn"],
      finalQuery: true,
    },
    // Suspected CN: direct domestic DNS with expectIPs; fallback via proxy.
    {
      tag: DNS_DIRECT_TAG,
      address: "114.114.114.114",
      skipFallback: true,
      domains: ["geosite:cn"],
      expectIPs: ["geoip:cn"],
    },
    {
      tag: DNS_DIRECT_TAG,
      address: "223.5.5.5",
      skipFallback: true,
      domains: ["geosite:cn"],
      expectIPs: ["geoip:cn"],
    },
    {
      address: "1.1.1.1",
      skipFallback: true,
      domains: ["geosite:cn"],
    },
    {
      address: "8.8.8.8",
      skipFallback: true,
      domains: ["geosite:cn"],
      finalQuery: true,
    },
    // Suspected non-CN: proxy expect !cn, then ECS fallback for misclassified CN CDN.
    {
      address: "1.1.1.1",
      skipFallback: true,
      domains: ["geosite:geolocation-!cn"],
      // Xray expects negation as geoip:!cn (not !geoip:cn).
      expectIPs: ["geoip:!cn"],
    },
    {
      address: "8.8.8.8",
      skipFallback: true,
      domains: ["geosite:geolocation-!cn"],
      expectIPs: ["geoip:!cn"],
    },
    {
      address: "8.8.8.8",
      clientIp: ECS_CLIENT_IP,
      skipFallback: true,
      domains: ["geosite:geolocation-!cn"],
    },
    {
      address: "8.8.4.4",
      clientIp: ECS_CLIENT_IP,
      skipFallback: true,
      domains: ["geosite:geolocation-!cn"],
      finalQuery: true,
    },
    // Unknown domains: China-first via ECS, then plain foreign DNS fallback.
    {
      address: "8.8.8.8",
      clientIp: ECS_CLIENT_IP,
      expectIPs: ["geoip:cn"],
    },
    {
      address: "8.8.4.4",
      clientIp: ECS_CLIENT_IP,
      expectIPs: ["geoip:cn"],
    },
    "1.1.1.1",
    "8.8.8.8",
  ]
}

/** IPv4 gateway Xray assigns to the TUN interface (point-to-point prefix). */
export const TUN_GATEWAY_CIDR = "172.19.0.1/30"
/** Bare gateway IP — also used as Windows NIC NameServer by the TUN service. */
export const TUN_GATEWAY_IP = "172.19.0.1"

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
 *
 * Sniffing uses `routeOnly: true` so the real destination IP is kept for
 * IP-first geo routing after domain sniff (XTLS realIp transparent guidance).
 */
function buildTunInbound(bypassRouter: boolean, enableIpv6: boolean): Record<string, unknown> {
  const ipv4Table = bypassRouter ? ["0.0.0.0/0"] : [...IPV4_EXCLUDING_LAN]
  // When IPv6 is off, do not capture ::/0 so traffic stays on the OS stack
  // (IPv4-only path). When on, include ::/0 and let dual-stack DNS + dial
  // prefer IPv6 with natural fallback to IPv4 when AAAA is missing/unreachable.
  const routeTable = enableIpv6 ? [...ipv4Table, "::/0"] : ipv4Table
  return {
    tag: "tun-in",
    protocol: "tun",
    settings: {
      name: TUN_INTERFACE_NAME,
      // Windows adapter description (default "Wintun"); kept explicit so
      // DNS-override heuristics can match "wintun"/"aurestream" aliases.
      desc: "AureStream TUN",
      mtu: 1500,
      gateway: [TUN_GATEWAY_CIDR],
      // Windows-only: set the TUN adapter's own NameServer to the gateway so
      // interface-scoped queries stay inside the tunnel path.
      dns: [TUN_GATEWAY_IP],
      autoSystemRoutingTable: routeTable,
      // Bind proxy outbounds to the physical NIC so TUN capture doesn't
      // loop Xray's own uplink traffic back into the tunnel (critical on
      // Windows full-route TUN).
      //
      // Default is "auto"; on Windows the engine rewrites this to the real
      // default-route NIC friendly name before starting AureStreamTunService
      // because Xray's auto-detect fails on multi-NIC / Hyper-V hosts
      // (`Failed to find matching adapter name`, 0x490).
      autoOutboundsInterface: "auto",
    },
    sniffing: {
      enabled: true,
      destOverride: ["http", "tls", "quic"],
      // Keep real destination IP for geoip routing after domain sniff.
      routeOnly: true,
    },
  }
}

/**
 * @param global When true ("全局模式"), skip CN-direct/ads-block rules so
 * non-LAN traffic falls through to the proxy balancer. When false ("规则模式"),
 * domestic IPs and ads are routed away from the balancer; DNS uses example 1.
 * @param tun When true, add the `tun` inbound (虚拟网卡模式) alongside the
 * local SOCKS inbound.
 * @param bypassRouter Only meaningful when `tun` is true — see `buildTunInbound`.
 * @param enableIpv6 When true, dual-stack DNS (UseIP) so AAAA can be used with
 * IPv4 fallback; when false, force IPv4-only DNS and omit IPv6 TUN routes.
 */
export function buildBaseXrayConfig(
  global: boolean,
  tun: boolean,
  bypassRouter: boolean = false,
  enableIpv6: boolean = false
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
    inbounds.push(buildTunInbound(bypassRouter, enableIpv6))
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
    dns: buildDnsConfig(global, enableIpv6),
    inbounds,
    outbounds: [
      {
        tag: "direct",
        protocol: "freedom",
        settings: {
          // Mirror DNS family preference on the direct dial path.
          domainStrategy: enableIpv6 ? "UseIP" : "UseIPv4",
        },
      },
      { tag: "block", protocol: "blackhole" },
      // Feeds OS/TUN DNS (port 53) into the top-level `dns` module.
      { tag: DNS_OUT_TAG, protocol: "dns" },
    ],
    routing: {
      domainStrategy: "IPIfNonMatch",
      rules: buildRoutingRules(global),
      balancers: [] as Record<string, unknown>[],
    },
  }
}
