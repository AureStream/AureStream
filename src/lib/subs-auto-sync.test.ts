import { describe, expect, it } from "vitest"
import {
  isEngineBlockingSubsSync,
  shouldRunAutoSubsSync,
  SUBS_SYNC_INTERVAL_MS,
  SUBS_SYNC_MIN_GAP_MS,
} from "./subs-auto-sync"

describe("subs auto sync policy", () => {
  it("blocks while engine is connected or transitioning", () => {
    expect(isEngineBlockingSubsSync("idle")).toBe(false)
    expect(isEngineBlockingSubsSync("failed")).toBe(false)
    expect(isEngineBlockingSubsSync("running")).toBe(true)
    expect(isEngineBlockingSubsSync("starting")).toBe(true)
    expect(isEngineBlockingSubsSync("stopping")).toBe(true)
  })

  it("skips without user, while in flight, or while connected", () => {
    const base = {
      hasUser: true,
      engineState: "idle",
      inFlight: false,
      lastSuccessAt: null as number | null,
      now: 1_000_000,
      ignoreInterval: true,
    }
    expect(shouldRunAutoSubsSync({ ...base, hasUser: false })).toBe(false)
    expect(shouldRunAutoSubsSync({ ...base, inFlight: true })).toBe(false)
    expect(shouldRunAutoSubsSync({ ...base, engineState: "running" })).toBe(
      false,
    )
    expect(shouldRunAutoSubsSync(base)).toBe(true)
  })

  it("enforces min gap even for login-style sync", () => {
    const now = 1_000_000
    expect(
      shouldRunAutoSubsSync({
        hasUser: true,
        engineState: "idle",
        inFlight: false,
        lastSuccessAt: now - SUBS_SYNC_MIN_GAP_MS + 1,
        now,
        ignoreInterval: true,
      }),
    ).toBe(false)
  })

  it("runs periodic sync only after the interval", () => {
    const now = 10_000_000
    expect(
      shouldRunAutoSubsSync({
        hasUser: true,
        engineState: "idle",
        inFlight: false,
        lastSuccessAt: now - SUBS_SYNC_INTERVAL_MS + 1,
        now,
      }),
    ).toBe(false)
    expect(
      shouldRunAutoSubsSync({
        hasUser: true,
        engineState: "idle",
        inFlight: false,
        lastSuccessAt: now - SUBS_SYNC_INTERVAL_MS,
        now,
      }),
    ).toBe(true)
  })
})
