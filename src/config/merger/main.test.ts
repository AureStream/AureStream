import { beforeEach, describe, expect, it, vi } from "vitest"

const writeFileMock = vi.hoisted(() => vi.fn())
const existsMock = vi.hoisted(() => vi.fn())
const createMock = vi.hoisted(() => vi.fn())
const getSubscriptionConfigMock = vi.hoisted(() => vi.fn())

vi.mock("@tauri-apps/plugin-fs", () => ({
  BaseDirectory: { AppConfig: "AppConfig" },
  exists: existsMock,
  writeFile: writeFileMock,
  create: createMock,
}))

vi.mock("../../action/db", () => ({
  getSubscriptionConfig: getSubscriptionConfigMock,
}))

vi.mock("../../single/store", () => ({
  getAllowLan: vi.fn(async () => false),
  getConfiguredDirectDNS: vi.fn(async () => undefined),
  getControllerPort: vi.fn(async () => 9191),
  getProxyPort: vi.fn(async () => 2345),
  isBypassRouterEnabled: vi.fn(async () => false),
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
    // Rule mode keeps the CN-direct/ads-block rules from the base template.
    expect(written.routing.rules).toContainEqual({
      type: "field",
      domain: ["geosite:cn"],
      outboundTag: "direct",
    })
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

  it("skips the CN-direct rules in global mode so everything falls through to the balancer", async () => {
    const { setGlobalConfig } = await import("./main")
    await setGlobalConfig("sub-a", false)

    const lastWriteCall = writeFileMock.mock.calls[writeFileMock.mock.calls.length - 1]
    const written = JSON.parse(new TextDecoder().decode(lastWriteCall?.[1]))

    const cnRule = written.routing.rules.find((r: any) => Array.isArray(r.domain) && r.domain.includes("geosite:cn"))
    expect(cnRule).toBeUndefined()
    expect(written.routing.rules).toContainEqual({
      type: "field",
      network: "tcp,udp",
      balancerTag: "proxy-balancer",
    })
  })

  it("rejects TUN mode as not yet supported", async () => {
    const { setRuleConfig, setGlobalConfig, makeProfile } = await import("./main")
    await expect(setRuleConfig("sub-a", true)).rejects.toThrow(/TUN mode/)
    await expect(setGlobalConfig("sub-a", true)).rejects.toThrow(/TUN mode/)
    expect(() => makeProfile("rule", true)).toThrow(/TUN mode/)
  })
})
