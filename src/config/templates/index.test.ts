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

  it("mixed-global template has only mixed inbound (no TUN)", () => {
    const types = inboundTypes("mixed-global")
    expect(types).toContain("mixed")
    expect(types).not.toContain("tun")
  })

  it("tun-global template has both mixed and tun inbounds", () => {
    expect(inboundTypes("tun-global")).toEqual(expect.arrayContaining(["mixed", "tun"]))
  })

  it("rewrites route rules for global mode", () => {
    const config = JSON.parse(getBuiltInTemplate("mixed-global"))
    const actions = config.route.rules.map((r: any) => r.action)
    expect(actions).toContain("sniff")
    expect(actions).toContain("hijack-dns")
    expect(actions).not.toContain("route")
  })
})
