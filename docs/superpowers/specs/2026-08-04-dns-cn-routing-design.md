# DNS-based CN / non-CN routing design

**Date:** 2026-08-04  
**Status:** Approved  
**Reference:** [用 DNS 实现精准境内外分流 (XTLS)](https://xtls.github.io/document/level-1/routing-with-dns.html)

## Goal

Replace the current simple `geosite:cn` / `geoip:cn` domain-list split with Xray-core’s full DNS-module strategy (doc **example 1**), so smart routing prefers accurate, CDN-friendly IPs and routes by **IP geo** rather than laggy domain lists.

Keep the three home-page toggles **independently switchable**:

| Toggle | ON | OFF |
|--------|----|-----|
| Smart routing | Rule mode: full DNS + IP CN split | Global: all non-LAN via proxy |
| Virtual NIC (TUN) | Add TUN inbound | System proxy only (`mixed-in`) |
| IPv6 | Dual-stack DNS + TUN `::/0` | IPv4-only DNS / no IPv6 TUN capture |

## Non-goals

- ECS `clientIp` UI or geo-detection (fixed public CN IP).
- FakeDNS / full “example 2 only” path.
- Per-app routing or privacy/WARP layering from the doc’s closing notes.
- Changing engine start/stop lifecycle beyond existing merge + hot-reload paths.

## Current state (baseline)

- `buildBaseXrayConfig` uses flat DNS `["223.5.5.5", "8.8.8.8"]` and rule-mode domain/IP CN direct + ads block.
- `updateDnsSettings` can **replace** the entire `dns.servers` list with a single configured direct DNS.
- Catch-all traffic uses `balancerTag: "proxy-balancer"` (not a `proxy` outbound tag).
- Home UI already toggles smart routing / TUN / IPv6 independently via store + `applyProxySettings`.

## Design decisions

1. **DNS depth:** Full doc example 1 (google / cn / geolocation-!cn / unknown + parallel query).
2. **Traffic rules:** IP-first — drop `geosite:cn` domain direct; keep ads block in rule mode.
3. **ECS:** Built-in default `clientIp: "222.85.85.85"` (no settings UI this iteration).
4. **Global mode:** Still keep `geoip:private → direct` so LAN does not enter the proxy; no CN direct, no ads block.
5. **DNS → proxy path:** Route `dns-proxy` with `balancerTag: "proxy-balancer"` (align with existing merger), not a fictional `outboundTag: "proxy"`.
6. **Implementation style:** Extend `xray-base-template.ts` (+ light `helper.ts` adjustments). No new abstraction layer.

## Behavior detail

### Smart routing ON (rule)

**DNS**

- `tag: "dns-proxy"`, `enableParallelQuery: true`
- `queryStrategy`: `UseIP` if IPv6 on, else `UseIPv4`
- Server chain (order fixed; mirrors example 1):

  1. Google: `1.1.1.1` / `8.8.8.8`, domains `geosite:google`, `geosite:google-cn`, `skipFallback`, last `finalQuery`
  2. Suspected CN: tagged `dns-direct` → `114.114.114.114` / `223.5.5.5` with `expectIPs: ["geoip:cn"]`; fallback proxy `1.1.1.1` / `8.8.8.8` for `geosite:cn` (last `finalQuery`)
  3. Suspected non-CN (`geosite:geolocation-!cn`): proxy with `expectIPs: ["!geoip:cn"]`, then ECS fallbacks with `clientIp: "222.85.85.85"`
  4. Unknown: ECS + `expectIPs: ["geoip:cn"]`, then plain `1.1.1.1` / `8.8.8.8`

- If user has configured `direct_dns` store value: **only** replace addresses on `dns-direct`-tagged servers; do not collapse the whole chain.

**Routing** (`domainStrategy: "IPIfNonMatch"`)

1. `inboundTag: ["dns-direct"]` → `outboundTag: "direct"`
2. `inboundTag: ["dns-proxy"]` → `balancerTag: "proxy-balancer"`
3. `ip: ["geoip:private"]` → `direct`
4. `ip: ["geoip:cn"]` → `direct`
5. `domain: ["geosite:category-ads-all"]` → `block`
6. Catch-all TCP/UDP → `proxy-balancer` (existing helper append)

**Sniffing**

- TUN inbound: `sniffing.enabled`, `destOverride: ["http","tls"]`, **`routeOnly: true`** (keep real IP for IP rules).
- System `mixed-in`: unchanged (no `routeOnly` required for socks domain targets).

**Direct outbound**

- Keep `domainStrategy` mirrored to IPv6 toggle (`UseIP` / `UseIPv4`) so direct dials reuse built-in DNS cache where useful.

### Smart routing OFF (global)

**DNS**

- Simple proxy-side servers (`1.1.1.1`, `8.8.8.8`), `tag: "dns-proxy"`.
- Same `queryStrategy` / IPv6 behavior.

**Routing**

1. `inboundTag: ["dns-proxy"]` → `balancerTag: "proxy-balancer"`
2. `ip: ["geoip:private"]` → `direct` (**retained**)
3. Catch-all → `proxy-balancer`

No `geoip:cn` direct, no ads block.

### Toggle independence

- Each of smart routing / TUN / IPv6 may flip without forcing the others.
- Connected changes continue through existing persist → merge/hot-reload / mode-switch paths.
- UI may stay as-is except optional copy clarifying “DNS-based smart split”; no new controls.

## Code touchpoints

| Area | File(s) | Change |
|------|---------|--------|
| Base config | `src/config/xray-base-template.ts` | `buildDnsConfig(...)`, rewrite `buildRoutingRules` / base `dns`+`routing` |
| Merger DNS patch | `src/config/merger/helper.ts` | Stop wiping full server list; patch `queryStrategy`, direct outbound strategy; inject custom direct DNS into `dns-direct` entries only |
| Merger entry | `src/config/merger/main.ts` | Pass-through only if signature needs update |
| Tests | `src/config/merger/main.test.ts` (+ template unit tests if split) | Assert DNS chain tags, IP rules, absence of `geosite:cn` direct, global private-only direct, TUN `routeOnly` |
| Cache key | `src/lib/merge-cache-key.ts` | No new store keys expected; leave as-is unless new inputs appear |
| UI | `src/components/MobileHome.tsx` | Optional comment/copy only |

## Constants

```ts
const ECS_CLIENT_IP = "222.85.85.85"
const DNS_DIRECT_TAG = "dns-direct"
const DNS_PROXY_TAG = "dns-proxy"
// balancer already: "proxy-balancer"
```

## Testing plan

1. **Unit:** rule vs global DNS server shapes; routing rule order and tags; configured direct DNS only rewrites `dns-direct` addresses; IPv6 flips `queryStrategy`; TUN present + `routeOnly`; global has private direct and no cn/ads.
2. **Manual (optional):** rule — baidu/domestic CDN direct, google/blocked sites via proxy; global — both via proxy, LAN still reachable; flip each bottom toggle alone while connected.

## Risks / notes

- Full DNS chain depends on shipped `geoip.dat` / `geosite.dat` (already copied at startup).
- Fixed ECS IP is not ISP-perfect; good enough default per product choice.
- Balancer tag must exist before DNS inbound rules are meaningful at runtime; catch-all and balancer injection order in helper must keep DNS rules **before** the final catch-all (base template owns DNS/geo rules; helper only appends catch-all).
- `updateDnsSettings` behavior change is intentional breaking change vs “replace entire servers array”; tests must cover it.

## Approval

- Approach A (template-local full DNS): approved.
- IP-first routing: approved.
- Fixed ECS client IP: approved.
- Global retains `geoip:private → direct`: approved (2026-08-04).
