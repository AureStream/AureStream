import { describe, expect, it } from "vitest"

import { shouldEnsureTunServiceBeforeModeAction } from "./proxy-mode-transition"

describe("proxy mode transition guards", () => {
  it("requires helper service before connecting or switching into TUN", () => {
    expect(shouldEnsureTunServiceBeforeModeAction("connect", "tun")).toBe(true)
    expect(shouldEnsureTunServiceBeforeModeAction("switch", "tun")).toBe(true)
  })

  it("does not require helper service for system proxy or disconnect actions", () => {
    expect(shouldEnsureTunServiceBeforeModeAction("connect", "rule")).toBe(false)
    expect(shouldEnsureTunServiceBeforeModeAction("switch", "rule")).toBe(false)
    expect(shouldEnsureTunServiceBeforeModeAction("disconnect", "tun")).toBe(false)
  })
})
