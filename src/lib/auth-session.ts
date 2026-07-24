export interface LogoutDeps {
  clearTokens: () => void
  setUser: (user: null) => void
  /** Must capture refresh token synchronously on invoke (before clearTokens). */
  revokeRemoteSession: () => Promise<void>
  clearLocalUserData: () => Promise<void>
  remoteTimeoutMs?: number
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), ms)
    promise
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch(() => {
        clearTimeout(timer)
        resolve(undefined)
      })
  })
}

/**
 * Synchronously clears the local auth session, then best-effort cleans up
 * remote session + local data in the background.
 *
 * Callers can navigate immediately after this returns — it does not await
 * network/db cleanup.
 */
export function beginLogout(deps: LogoutDeps): void {
  // Start remote revoke while token is still present, then drop local session.
  const remote = deps.revokeRemoteSession()
  deps.clearTokens()
  deps.setUser(null)

  void Promise.allSettled([
    withTimeout(remote, deps.remoteTimeoutMs ?? 2500),
    withTimeout(
      deps.clearLocalUserData().catch((error) => {
        console.error("[auth] Failed to clear local user data on logout:", error)
      }),
      deps.remoteTimeoutMs ?? 2500
    ),
  ])
}

/** @deprecated Prefer beginLogout for UI paths; kept for tests that await cleanup. */
export async function completeLogout(deps: LogoutDeps): Promise<void> {
  const remote = deps.revokeRemoteSession()
  deps.clearTokens()
  deps.setUser(null)

  await Promise.allSettled([
    withTimeout(remote, deps.remoteTimeoutMs ?? 2500),
    withTimeout(
      deps.clearLocalUserData().catch((error) => {
        console.error("[auth] Failed to clear local user data on logout:", error)
      }),
      deps.remoteTimeoutMs ?? 2500
    ),
  ])
}
