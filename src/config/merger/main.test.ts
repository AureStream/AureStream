import { beforeEach, describe, expect, it, vi } from "vitest"

const writeFileMock = vi.hoisted(() => vi.fn())
const existsMock = vi.hoisted(() => vi.fn())
const createMock = vi.hoisted(() => vi.fn())
const getSubscriptionConfigMock = vi.hoisted(() => vi.fn())
const isBypassRouterEnabledMock = vi.hoisted(() => vi.fn())

vi.mock("@tauri-apps/plugin-fs", () => ({
  BaseDirectory: { AppConfig: "AppConfig" },
  exists: existsMock,
  writeFile: writeFileMock,
  create: createMock,
}))

vi.mock("../../action/db", () => ({
  getSubscriptionConfig: getSubscriptionConfigMock,
}))

const getConfiguredDirectDNSMock = vi.hoisted(() => vi.fn(async (): Promise<string | undefined> => undefined))

vi.mock("../../single/store", () => ({
  getAllowLan: vi.fn(async () => false),
  getConfiguredDirectDNS: getConfiguredDirectDNSMock,
  getControllerPort: vi.fn(async () => 9191),
  getEnableIpv6: vi.fn(async () => false),
  getProxyPort: vi.fn(async () => 2345),
  isBypassRouterEnabled: isBypassRouterEnabledMock,
}))

const sampleOutbounds = [
  {
    tag: "node-a",
    protocol: "vless",
    settings: {
      vnext: [{ address: "1.2.3.4", port: 443, users: [{ id: "uuid-a", encryption: "none" }] }],
    },
    streamSettings: { network: "ws", security: "tls", tlsSettings: { serverName: "example.com" } },
  },
  {
    tag: "node-b",
    protocol: "vless",
    settings: {
      vnext: [{ address: "5.6.7.8", port: 443, users: [{ id: "uuid-b", encryption: "none" }] }],
    },
    streamSettings: { network: "ws", security: "tls", tlsSettings: { serverName: "example.com" } },
    _fragment: { packets: "tlshello", length: "40-60", interval: "30-50" },
  },
]

describe("config merger (Xray-core, local template)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    existsMock.mockResolvedValue(true)
    writeFileMock.mockResolvedValue(undefined)
    createMock.mockResolvedValue({
      write: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    })
    getSubscriptionConfigMock.mockResolvedValue({ outbounds: sampleOutbounds })
    isBypassRouterEnabledMock.mockResolvedValue(false)
    getConfiguredDirectDNSMock.mockResolvedValue(undefined)
  })

  it("writes a locally-built config with all subscription nodes in the proxy balancer", async () => {
    const { setRuleConfig } = await import("./main")

    await expect(setRuleConfig("sub-a", false)).resolves.toBeUndefined()

    const lastWriteCall = writeFileMock.mock.calls[writeFileMock.mock.calls.length - 1]
    const written = JSON.parse(new TextDecoder().decode(lastWriteCall?.[1]))

    expect(written.api).toEqual({
      tag: "api",
      listen: "127.0.0.1:9191",
      services: ["HandlerService", "LoggerService", "StatsService", "RoutingService"],
    })

    const tags = written.outbounds.map((o: any) => o.tag)
    expect(tags).toContain("node-a")
    expect(tags).toContain("node-b")
    expect(tags).toContain("direct")
    expect(tags).toContain("block")

    expect(written.routing.balancers).toEqual([
      { tag: "proxy-balancer", selector: ["node-a", "node-b"], strategy: { type: "random" } },
    ])
    expect(written.routing.rules).toContainEqual({
      type: "field",
      network: "tcp,udp",
      balancerTag: "proxy-balancer",
    })
    // IP-first CN split (no geosite:cn domain direct — laggy list can mis-route).
    expect(written.outbounds.some((o: any) => o.tag === "dns-out" && o.protocol === "dns")).toBe(true)
    // Port-53 capture must precede private-IP direct or Windows TUN DNS dies.
    expect(written.routing.rules[0]).toEqual({
      type: "field",
      port: "53",
      network: "udp,tcp",
      outboundTag: "dns-out",
    })
    // Link-local / NetBIOS noise dropped before private-IP direct.
    expect(written.routing.rules[1]).toEqual({
      type: "field",
      ip: ["169.254.0.0/16", "fe80::/10"],
      outboundTag: "block",
    })
    expect(written.routing.rules[2]).toEqual({
      type: "field",
      port: "137,138",
      network: "udp",
      outboundTag: "block",
    })
    expect(written.routing.rules).toContainEqual({
      type: "field",
      inboundTag: ["dns-direct"],
      outboundTag: "direct",
    })
    expect(written.routing.rules).toContainEqual({
      type: "field",
      inboundTag: ["dns-proxy"],
      balancerTag: "proxy-balancer",
    })
    expect(written.routing.rules).toContainEqual({
      type: "field",
      ip: ["geoip:private"],
      outboundTag: "direct",
    })
    expect(written.routing.rules).toContainEqual({
      type: "field",
      ip: ["geoip:cn"],
      outboundTag: "direct",
    })
    expect(written.routing.rules).toContainEqual({
      type: "field",
      domain: ["geosite:category-ads-all"],
      outboundTag: "block",
    })
    const geositeCnDirect = written.routing.rules.find(
      (r: any) => Array.isArray(r.domain) && r.domain.includes("geosite:cn") && r.outboundTag === "direct",
    )
    expect(geositeCnDirect).toBeUndefined()
  })

  it("builds full DNS example-1 chain in rule mode", async () => {
    const { setRuleConfig } = await import("./main")
    await setRuleConfig("sub-a", false)

    const lastWriteCall = writeFileMock.mock.calls[writeFileMock.mock.calls.length - 1]
    const written = JSON.parse(new TextDecoder().decode(lastWriteCall?.[1]))

    expect(written.dns.tag).toBe("dns-proxy")
    expect(written.dns.enableParallelQuery).toBe(true)
    expect(written.routing.domainStrategy).toBe("IPIfNonMatch")

    const servers = written.dns.servers as any[]
    expect(Array.isArray(servers)).toBe(true)
    expect(servers.length).toBeGreaterThan(10)

    const googleServers = servers.filter(
      (s) => Array.isArray(s?.domains) && s.domains.includes("geosite:google"),
    )
    expect(googleServers.length).toBeGreaterThanOrEqual(2)
    expect(googleServers.some((s) => s.finalQuery === true)).toBe(true)

    const dnsDirect = servers.filter((s) => s?.tag === "dns-direct")
    expect(dnsDirect.length).toBeGreaterThanOrEqual(2)
    expect(dnsDirect.every((s) => s.expectIPs?.includes("geoip:cn"))).toBe(true)
    expect(dnsDirect.map((s) => s.address)).toEqual(
      expect.arrayContaining(["114.114.114.114", "223.5.5.5"]),
    )

    const nonCn = servers.filter(
      (s) => Array.isArray(s?.domains) && s.domains.includes("geosite:geolocation-!cn"),
    )
    expect(nonCn.length).toBeGreaterThanOrEqual(4)
    expect(nonCn.some((s) => s.clientIp === "222.85.85.85")).toBe(true)
    expect(nonCn.some((s) => Array.isArray(s.expectIPs) && s.expectIPs.includes("geoip:!cn"))).toBe(true)

    // Unknown-domain ECS probes (no domains filter) with geoip:cn expect.
    const unknownEcs = servers.filter(
      (s) => typeof s === "object" && s?.clientIp === "222.85.85.85" && !s.domains && Array.isArray(s.expectIPs),
    )
    expect(unknownEcs.length).toBeGreaterThanOrEqual(2)
  })

  it("dedupes identical fragment tuples into a single shared freedom outbound", async () => {
    const { setRuleConfig } = await import("./main")
    await setRuleConfig("sub-a", false)

    const lastWriteCall = writeFileMock.mock.calls[writeFileMock.mock.calls.length - 1]
    const written = JSON.parse(new TextDecoder().decode(lastWriteCall?.[1]))

    const fragmentOutbounds = written.outbounds.filter((o: any) => o.protocol === "freedom" && o.settings?.fragment)
    expect(fragmentOutbounds).toHaveLength(1)
    expect(fragmentOutbounds[0].settings.fragment).toEqual({
      packets: "tlshello",
      length: "40-60",
      interval: "30-50",
    })

    const nodeB = written.outbounds.find((o: any) => o.tag === "node-b")
    expect(nodeB.streamSettings.sockopt.dialerProxy).toBe(fragmentOutbounds[0].tag)
    expect(nodeB._fragment).toBeUndefined()

    const nodeA = written.outbounds.find((o: any) => o.tag === "node-a")
    expect(nodeA.streamSettings.sockopt).toBeUndefined()
  })

  it("skips CN/ads rules in global mode but keeps private direct and simple proxy DNS", async () => {
    const { setGlobalConfig } = await import("./main")
    await setGlobalConfig("sub-a", false)

    const lastWriteCall = writeFileMock.mock.calls[writeFileMock.mock.calls.length - 1]
    const written = JSON.parse(new TextDecoder().decode(lastWriteCall?.[1]))

    const cnIpRule = written.routing.rules.find(
      (r: any) => Array.isArray(r.ip) && r.ip.includes("geoip:cn"),
    )
    expect(cnIpRule).toBeUndefined()
    const adsRule = written.routing.rules.find(
      (r: any) => Array.isArray(r.domain) && r.domain.includes("geosite:category-ads-all"),
    )
    expect(adsRule).toBeUndefined()
    expect(written.routing.rules).toContainEqual({
      type: "field",
      ip: ["geoip:private"],
      outboundTag: "direct",
    })
    expect(written.routing.rules).toContainEqual({
      type: "field",
      inboundTag: ["dns-proxy"],
      balancerTag: "proxy-balancer",
    })
    expect(written.routing.rules).toContainEqual({
      type: "field",
      network: "tcp,udp",
      balancerTag: "proxy-balancer",
    })
    // No dns-direct tag in global DNS (simple proxy-side resolvers only).
    expect(written.dns.tag).toBe("dns-proxy")
    expect(written.dns.servers).toEqual(["1.1.1.1", "8.8.8.8"])
    expect(written.dns.enableParallelQuery).toBeUndefined()
  })

  it("adds the tun inbound with routeOnly sniffing when tun=true in rule mode", async () => {
    const { setRuleConfig, makeProfile } = await import("./main")
    expect(makeProfile("rule", true)).toEqual({ mode: "tun" })

    await setRuleConfig("sub-a", true)

    const lastWriteCall = writeFileMock.mock.calls[writeFileMock.mock.calls.length - 1]
    const written = JSON.parse(new TextDecoder().decode(lastWriteCall?.[1]))

    const tunInbound = written.inbounds.find((ib: any) => ib.protocol === "tun")
    expect(tunInbound).toBeDefined()
    expect(tunInbound.settings.gateway).toEqual(["172.19.0.1/30"])
    expect(tunInbound.settings.dns).toEqual(["172.19.0.1"])
    expect(tunInbound.settings.desc).toBe("AureStream TUN")
    expect(tunInbound.settings.autoOutboundsInterface).toBe("auto")
    // Default (non-bypass-router, IPv6 off): LAN ranges excluded; no ::/0 capture.
    expect(tunInbound.settings.autoSystemRoutingTable).not.toContain("0.0.0.0/0")
    expect(tunInbound.settings.autoSystemRoutingTable).not.toContain("::/0")
    expect(tunInbound.settings.autoSystemRoutingTable.length).toBeGreaterThan(40)
    expect(tunInbound.sniffing).toEqual({
      enabled: true,
      destOverride: ["http", "tls", "quic"],
      routeOnly: true,
    })
    expect(written.routing.rules[0]).toEqual({
      type: "field",
      port: "53",
      network: "udp,tcp",
      outboundTag: "dns-out",
    })
    expect(written.routing.rules[1]).toEqual({
      type: "field",
      ip: ["169.254.0.0/16", "fe80::/10"],
      outboundTag: "block",
    })
    // Local SOCKS inbound stays present alongside tun.
    expect(written.inbounds.some((ib: any) => ib.tag === "mixed-in")).toBe(true)
    expect(written.routing.rules).toContainEqual({
      type: "field",
      ip: ["geoip:cn"],
      outboundTag: "direct",
    })
  })

  it("bypass-router mode captures full IPv4 (and IPv6 when enabled) for tun", async () => {
    isBypassRouterEnabledMock.mockResolvedValue(true)
    const { setRuleConfig } = await import("./main")

    await setRuleConfig("sub-a", true)

    const lastWriteCall = writeFileMock.mock.calls[writeFileMock.mock.calls.length - 1]
    const written = JSON.parse(new TextDecoder().decode(lastWriteCall?.[1]))
    const tunInbound = written.inbounds.find((ib: any) => ib.protocol === "tun")
    // IPv6 store default is off → IPv4-only full capture.
    expect(tunInbound.settings.autoSystemRoutingTable).toEqual(["0.0.0.0/0"])
  })

  it("global+tun skips CN-direct rules but still adds the tun inbound", async () => {
    const { setGlobalConfig, makeProfile } = await import("./main")
    expect(makeProfile("global", true)).toEqual({ mode: "tun-global" })

    await setGlobalConfig("sub-a", true)

    const lastWriteCall = writeFileMock.mock.calls[writeFileMock.mock.calls.length - 1]
    const written = JSON.parse(new TextDecoder().decode(lastWriteCall?.[1]))

    expect(written.inbounds.some((ib: any) => ib.protocol === "tun")).toBe(true)
    const cnIpRule = written.routing.rules.find(
      (r: any) => Array.isArray(r.ip) && r.ip.includes("geoip:cn"),
    )
    expect(cnIpRule).toBeUndefined()
    expect(written.routing.rules).toContainEqual({
      type: "field",
      ip: ["geoip:private"],
      outboundTag: "direct",
    })
  })

  it("injects configured direct DNS only into dns-direct servers", async () => {
    getConfiguredDirectDNSMock.mockResolvedValue("119.29.29.29")
    const { setRuleConfig } = await import("./main")
    await setRuleConfig("sub-a", false)

    const lastWriteCall = writeFileMock.mock.calls[writeFileMock.mock.calls.length - 1]
    const written = JSON.parse(new TextDecoder().decode(lastWriteCall?.[1]))
    const servers = written.dns.servers as any[]

    const dnsDirect = servers.filter((s) => s?.tag === "dns-direct")
    expect(dnsDirect.length).toBeGreaterThanOrEqual(1)
    expect(dnsDirect.every((s) => s.address === "119.29.29.29")).toBe(true)
    // Full chain preserved (not collapsed to a single string server).
    expect(servers.length).toBeGreaterThan(5)
    expect(servers.some((s) => typeof s === "object" && s.domains?.includes("geosite:google"))).toBe(true)
  })

  it("does not add a tun inbound in System Proxy mode", async () => {
    const { setRuleConfig } = await import("./main")
    await setRuleConfig("sub-a", false)

    const lastWriteCall = writeFileMock.mock.calls[writeFileMock.mock.calls.length - 1]
    const written = JSON.parse(new TextDecoder().decode(lastWriteCall?.[1]))
    expect(written.inbounds.some((ib: any) => ib.protocol === "tun")).toBe(false)
  })

  it("defaults to IPv4-only DNS strategy when IPv6 is disabled", async () => {
    const { setRuleConfig } = await import("./main")
    await setRuleConfig("sub-a", false)

    const lastWriteCall = writeFileMock.mock.calls[writeFileMock.mock.calls.length - 1]
    const written = JSON.parse(new TextDecoder().decode(lastWriteCall?.[1]))
    expect(written.dns.queryStrategy).toBe("UseIPv4")
    const direct = written.outbounds.find((o: any) => o.tag === "direct")
    expect(direct.settings.domainStrategy).toBe("UseIPv4")
  })

  it("uses dual-stack DNS and IPv6 TUN routes when IPv6 is enabled", async () => {
    const store = await import("../../single/store")
    vi.mocked(store.getEnableIpv6).mockResolvedValue(true)

    const { setRuleConfig } = await import("./main")
    await setRuleConfig("sub-a", true)

    const lastWriteCall = writeFileMock.mock.calls[writeFileMock.mock.calls.length - 1]
    const written = JSON.parse(new TextDecoder().decode(lastWriteCall?.[1]))
    expect(written.dns.queryStrategy).toBe("UseIP")
    const direct = written.outbounds.find((o: any) => o.tag === "direct")
    expect(direct.settings.domainStrategy).toBe("UseIP")
    const tunInbound = written.inbounds.find((ib: any) => ib.protocol === "tun")
    expect(tunInbound.settings.autoSystemRoutingTable).toContain("::/0")
  })
})
