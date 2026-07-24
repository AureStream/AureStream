import { describe, expect, it, vi } from "vitest"

import { beginLogout, completeLogout } from "./auth-session"

describe("beginLogout", () => {
  it("clears local session synchronously before any async cleanup finishes", () => {
    const clearTokens = vi.fn()
    const setUser = vi.fn()
    const clearLocalUserData = vi.fn(
      () =>
        new Promise<void>(() => {
          /* hang */
        })
    )
    const revokeRemoteSession = vi.fn(
      () =>
        new Promise<void>(() => {
          /* hang */
        })
    )

    beginLogout({
      clearTokens,
      setUser,
      revokeRemoteSession,
      clearLocalUserData,
      remoteTimeoutMs: 50,
    })

    expect(revokeRemoteSession).toHaveBeenCalledTimes(1)
    expect(clearTokens).toHaveBeenCalledTimes(1)
    expect(setUser).toHaveBeenCalledWith(null)
  })
})

describe("completeLogout", () => {
  it("clears local session immediately even when remote logout never resolves", async () => {
    const clearTokens = vi.fn()
    const setUser = vi.fn()
    const clearLocalUserData = vi.fn().mockResolvedValue(undefined)
    const revokeRemoteSession = vi.fn(
      () =>
        new Promise<void>(() => {
          /* hang forever */
        })
    )

    const started = Date.now()
    await completeLogout({
      clearTokens,
      setUser,
      revokeRemoteSession,
      clearLocalUserData,
      remoteTimeoutMs: 50,
    })
    const elapsed = Date.now() - started

    expect(clearTokens).toHaveBeenCalledTimes(1)
    expect(setUser).toHaveBeenCalledWith(null)
    expect(clearLocalUserData).toHaveBeenCalledTimes(1)
    expect(elapsed).toBeLessThan(500)
  })

  it("still finishes when local cleanup fails", async () => {
    const clearTokens = vi.fn()
    const setUser = vi.fn()

    await completeLogout({
      clearTokens,
      setUser,
      revokeRemoteSession: vi.fn().mockResolvedValue(undefined),
      clearLocalUserData: vi.fn().mockRejectedValue(new Error("db locked")),
      remoteTimeoutMs: 50,
    })

    expect(clearTokens).toHaveBeenCalled()
    expect(setUser).toHaveBeenCalledWith(null)
  })
})
