import { describe, expect, it } from "vitest"
import {
  shouldRunAutoSubsSync,
  SUBS_SYNC_INTERVAL_MS,
  SUBS_SYNC_MIN_GAP_MS,
} from "./subs-auto-sync"

describe("subs auto sync policy", () => {
  it("skips without user or while a sync is in flight", () => {
    const base = {
      hasUser: true,
      inFlight: false,
      lastSuccessAt: null as number | null,
      now: 1_000_000,
      ignoreInterval: true,
    }
    expect(shouldRunAutoSubsSync({ ...base, hasUser: false })).toBe(false)
    expect(shouldRunAutoSubsSync({ ...base, inFlight: true })).toBe(false)
    expect(shouldRunAutoSubsSync(base)).toBe(true)
  })

  it("enforces min gap even for login-style sync", () => {
    const now = 1_000_000
    expect(
      shouldRunAutoSubsSync({
        hasUser: true,
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
        inFlight: false,
        lastSuccessAt: now - SUBS_SYNC_INTERVAL_MS + 1,
        now,
      }),
    ).toBe(false)
    expect(
      shouldRunAutoSubsSync({
        hasUser: true,
        inFlight: false,
        lastSuccessAt: now - SUBS_SYNC_INTERVAL_MS,
        now,
      }),
    ).toBe(true)
  })
})
