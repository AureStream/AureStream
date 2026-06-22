import { describe, expect, it } from "vitest"

import {
  shouldAllowConnectionToggle,
  shouldRefreshNetworkInfoOnEngineState,
} from "./home-network-info"

describe("home network info refresh policy", () => {
  it("refreshes after connect and disconnect settle", () => {
    expect(shouldRefreshNetworkInfoOnEngineState("starting", "running")).toBe(true)
    expect(shouldRefreshNetworkInfoOnEngineState("stopping", "idle")).toBe(true)
  })

  it("does not refresh for repeated or transitional engine states", () => {
    expect(shouldRefreshNetworkInfoOnEngineState(null, "idle")).toBe(false)
    expect(shouldRefreshNetworkInfoOnEngineState("running", "running")).toBe(false)
    expect(shouldRefreshNetworkInfoOnEngineState("idle", "starting")).toBe(false)
    expect(shouldRefreshNetworkInfoOnEngineState("running", "stopping")).toBe(false)
  })
})

describe("home connection toggle policy", () => {
  it("allows clicking the connection ball while already running", () => {
    expect(shouldAllowConnectionToggle("running", false)).toBe(true)
    expect(shouldAllowConnectionToggle("running", true)).toBe(true)
  })

  it("blocks transitional states and local connect operations", () => {
    expect(shouldAllowConnectionToggle("starting", false)).toBe(false)
    expect(shouldAllowConnectionToggle("stopping", false)).toBe(false)
    expect(shouldAllowConnectionToggle("idle", true)).toBe(false)
  })
})
