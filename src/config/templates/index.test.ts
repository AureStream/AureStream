import { describe, expect, it } from "vitest"

import { getBuiltInTemplate } from "./index"

function inboundTypes(mode: Parameters<typeof getBuiltInTemplate>[0]) {
  const config = JSON.parse(getBuiltInTemplate(mode))
  return config.inbounds.map((inbound: { type: string }) => inbound.type)
}

describe("built-in sing-box templates", () => {
  it("mixed template has only mixed inbound (no TUN)", () => {
    const types = inboundTypes("mixed")
    expect(types).toContain("mixed")
    expect(types).not.toContain("tun")
  })

  it("tun template has both mixed and tun inbounds", () => {
    expect(inboundTypes("tun")).toEqual(expect.arrayContaining(["mixed", "tun"]))
  })

  it("tun template uses sing-box 1.13 route_exclude_address for route bypasses", () => {
    const config = JSON.parse(getBuiltInTemplate("tun"))
    const tunInbound = config.inbounds.find((inbound: { type: string }) => inbound.type === "tun")

    expect(tunInbound).toBeTruthy()
    expect(tunInbound.platform?.http_proxy).toMatchObject({
      enabled: true,
      server: "127.0.0.1",
      server_port: 6789,
    })
    expect(tunInbound.route_exclude_address).toEqual(expect.arrayContaining([
      "10.0.0.0/8",
      "172.16.0.0/12",
      "192.168.0.0/16",
      "127.0.0.0/8",
      "fc00::/7",
    ]))
    expect(tunInbound).not.toHaveProperty("inet4_bypass_address")
  })

  it("mixed-global template has only mixed inbound (no TUN)", () => {
    const types = inboundTypes("mixed-global")
    expect(types).toContain("mixed")
    expect(types).not.toContain("tun")
  })

  it("tun-global template has both mixed and tun inbounds", () => {
    expect(inboundTypes("tun-global")).toEqual(expect.arrayContaining(["mixed", "tun"]))
  })

  it("uses OneOhCloud route structure for global mode", () => {
    const config = JSON.parse(getBuiltInTemplate("mixed-global"))
    const actions = config.route.rules.map((r: any) => r.action)
    expect(actions).toContain("sniff")
    expect(actions).toContain("hijack-dns")
    expect(actions).toContain("reject")
    expect(config.route.final).toBe("ExitGateway")
    expect(config.route.default_domain_resolver).toBe("system")
    expect(
      config.route.rules.some((rule: any) =>
        Array.isArray(rule.domain) && rule.domain.includes("direct-tag.oneoh.cloud")
      )
    ).toBe(false)
  })

  it("keeps custom routing slots in rule mode templates", () => {
    const config = JSON.parse(getBuiltInTemplate("mixed"))

    expect(
      config.route.rules.some((rule: any) =>
        Array.isArray(rule.domain) && rule.domain.includes("direct-tag.oneoh.cloud")
      )
    ).toBe(true)
    expect(
      config.route.rules.some((rule: any) =>
        Array.isArray(rule.domain) && rule.domain.includes("proxy-tag.oneoh.cloud")
      )
    ).toBe(true)
  })
})
