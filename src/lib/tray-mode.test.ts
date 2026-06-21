import { describe, expect, it } from "vitest"

import {
  getCheckedTrayMode,
  planTrayModeAction,
  type TrayEngineState,
} from "./tray-mode"

describe("tray mode state", () => {
  it("keeps the current running mode connected when clicking the same tray item", () => {
    const state: TrayEngineState = { kind: "running", mode: "mixed" }

    expect(planTrayModeAction(state, "system")).toEqual({
      action: "noop",
      targetUiMode: "rule",
      targetEngineMode: "SystemProxy",
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

  it("returns exactly one checked tray item for active engine modes", () => {
    expect(getCheckedTrayMode({ kind: "running", mode: "mixed" })).toEqual({
      system: true,
      tun: false,
    })
    expect(getCheckedTrayMode({ kind: "starting", mode: "tun" })).toEqual({
      system: false,
      tun: true,
    })
  })

  it("does not check any tray item while disconnected", () => {
    expect(getCheckedTrayMode({ kind: "idle" })).toEqual({
      system: false,
      tun: false,
    })
  })
})
