import { describe, expect, it, vi } from "vitest"

import { beginLogout } from "./auth-session"

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
