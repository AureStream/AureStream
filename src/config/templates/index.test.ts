import { describe, expect, it } from "vitest"

import { ALL_CONFIG_MODES } from "../common"
import { getBuiltInTemplate } from "./index"

function inboundTypes(mode: Parameters<typeof getBuiltInTemplate>[0]) {
  const config = JSON.parse(getBuiltInTemplate(mode))
  return config.inbounds.map((inbound: { type: string }) => inbound.type)
}

function tunInbound(mode: Parameters<typeof getBuiltInTemplate>[0]) {
  const config = JSON.parse(getBuiltInTemplate(mode))
  return config.inbounds.find((inbound: { type: string }) => inbound.type === "tun")
}

describe("built-in sing-box templates", () => {
  it("registers resident template modes for cache and merge callers", () => {
    expect(ALL_CONFIG_MODES).toEqual(
      expect.arrayContaining(["resident", "resident-global"])
    )
  })

  it("keeps both mixed and tun inbounds in the resident rule template", () => {
    expect(inboundTypes("resident")).toEqual(expect.arrayContaining(["mixed", "tun"]))
  })

  it("keeps both mixed and tun inbounds in the resident global template", () => {
    expect(inboundTypes("resident-global")).toEqual(
      expect.arrayContaining(["mixed", "tun"])
    )
  })

  it("leaves resident TUN present but not auto-capturing routes on core startup", () => {
    expect(tunInbound("resident")?.auto_route).toBe(false)
    expect(tunInbound("resident-global")?.auto_route).toBe(false)
  })

  it("keeps the legacy TUN template auto-route behavior unchanged", () => {
    expect(tunInbound("tun")?.auto_route).toBe(true)
  })
})
