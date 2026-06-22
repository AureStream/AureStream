import { describe, expect, it } from "vitest"

import {
  planTrayModeAction,
  type TrayEngineState,
} from "./tray-mode"

describe("tray mode action planning", () => {
  it("disconnects when clicking the already-active mode (system proxy)", () => {
    const state: TrayEngineState = { kind: "running", mode: "mixed" }

    expect(planTrayModeAction(state, "system")).toEqual({
      action: "disconnect",
      targetUiMode: "rule",
      targetEngineMode: "SystemProxy",
    })
  })

  it("disconnects when clicking the already-active mode (TUN)", () => {
    const state: TrayEngineState = { kind: "running", mode: "tun" }

    expect(planTrayModeAction(state, "tun")).toEqual({
      action: "disconnect",
      targetUiMode: "tun",
      targetEngineMode: "IntoProxy",
    })
  })

  it("switches modes when clicking the other tray item while connected", () => {
    const state: TrayEngineState = { kind: "running", mode: "tun" }

    expect(planTrayModeAction(state, "system")).toEqual({
      action: "switch",
      targetUiMode: "rule",
      targetEngineMode: "SystemProxy",
    })
  })

  it("connects in the requested mode when currently idle", () => {
    const state: TrayEngineState = { kind: "idle" }

    expect(planTrayModeAction(state, "tun")).toEqual({
      action: "connect",
      targetUiMode: "tun",
      targetEngineMode: "IntoProxy",
    })
  })
})
