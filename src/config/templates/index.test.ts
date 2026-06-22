import { describe, expect, it } from "vitest"

import { getBuiltInTemplate } from "./index"

function inboundTypes(mode: Parameters<typeof getBuiltInTemplate>[0]) {
  const config = JSON.parse(getBuiltInTemplate(mode))
  return config.inbounds.map((inbound: { type: string }) => inbound.type)
}

describe("built-in sing-box templates", () => {
  it("keeps both mixed and tun inbounds in rule template", () => {
    expect(inboundTypes("rule")).toEqual(expect.arrayContaining(["mixed", "tun"]))
  })

  it("keeps both mixed and tun inbounds in global template", () => {
    expect(inboundTypes("global")).toEqual(expect.arrayContaining(["mixed", "tun"]))
  })

  it("rewrites route rules for global mode", () => {
    const config = JSON.parse(getBuiltInTemplate("global"))
    const actions = config.route.rules.map((r: any) => r.action)
    expect(actions).toContain("sniff")
    expect(actions).toContain("hijack-dns")
  })
})
