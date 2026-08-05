import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"
import {
  type User,
  type RegisterPendingResult,
  login as apiLogin,
  register as apiRegister,
  verifyRegister as apiVerifyRegister,
  revokeRemoteSession,
  clearTokens,
  refreshToken,
  hasTokens,
} from "../api/auth"
import { apiFetch } from "../api/client"
import { beginLogout } from "../lib/auth-session"
import { clearLocalUserData } from "../lib/auth-cleanup"
import { bootstrapSessionData, resetSessionBootstrapState } from "../lib/session-bootstrap"

interface AuthState {
  user: User | null
  loading: boolean
  /** True only after auth is known and subscription bootstrap finished (or no session). */
  sessionReady: boolean
  login: (email: string, password: string) => Promise<void>
  /** Send email verification code (does not create user). */
  register: (email: string, password: string) => Promise<RegisterPendingResult>
  /** Verify code, create user, then log in and bootstrap session. */
  verifyAndLogin: (email: string, password: string, code: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  sessionReady: false,
  login: async () => {},
  register: async () => ({ email: "", expires_in: 0 }),
  verifyAndLogin: async () => {},
  logout: async () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [sessionReady, setSessionReady] = useState(false)

  // On mount, restore session from stored tokens then bootstrap local data.
  useEffect(() => {
    let cancelled = false

    ;(async () => {
      if (!hasTokens()) {
        if (!cancelled) {
          setUser(null)
          setSessionReady(true)
          setLoading(false)
        }
        return
      }

      try {
        let nextUser: User | null = null
        const res = await apiFetch("/user/me")
        if (res.ok) {
          nextUser = await res.json()
        } else {
          // apiFetch already attempts one refresh on 401; retry path is a last resort.
          const refreshed = await refreshToken()
          if (refreshed) {
            const retry = await apiFetch("/user/me")
            if (retry.ok) nextUser = await retry.json()
          }
        }

        if (cancelled) return

        if (!nextUser) {
          clearTokens()
          setUser(null)
          setSessionReady(true)
          return
        }

        // Keep user unset until bootstrap finishes so PublicOnly cannot race home.
        try {
          await bootstrapSessionData("restore")
        } catch (bootstrapErr) {
          // Auth succeeded — still enter app; home can paint from local cache.
          console.error("[auth] session restore bootstrap failed:", bootstrapErr)
        }
        if (cancelled) return

        setUser(nextUser)
        setSessionReady(true)
      } catch {
        if (!cancelled) {
          setUser(null)
          setSessionReady(true)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    // Keep sessionReady true while user is still null so PublicOnly does not
    // unmount the login form. Only setUser after bootstrap completes.
    try {
      const result = await apiLogin(email, password)

      try {
        await clearLocalUserData()
      } catch (cleanErr) {
        console.error("Failed to clear local user data after login:", cleanErr)
        // Continue: remote sync still reconciles by subscription id.
      }

      resetSessionBootstrapState()
      await bootstrapSessionData("login")

      setUser(result.user)
      setSessionReady(true)
      setLoading(false)
    } catch (error) {
      clearTokens()
      setUser(null)
      setSessionReady(true)
      setLoading(false)
      resetSessionBootstrapState()
      throw error
    }
  }, [])

  const register = useCallback(async (email: string, password: string) => {
    return apiRegister(email, password)
  }, [])

  const verifyAndLogin = useCallback(
    async (email: string, password: string, code: string) => {
      await apiVerifyRegister(email, code)
      await login(email, password)
    },
    [login],
  )

  const logout = useCallback(async () => {
    resetSessionBootstrapState()
    setSessionReady(true)
    // Must clear session synchronously — never await import/network before setUser(null).
    beginLogout({
      clearTokens,
      setUser,
      revokeRemoteSession,
      clearLocalUserData,
    })
  }, [])

  return (
    <AuthContext.Provider
      value={{ user, loading, sessionReady, login, register, verifyAndLogin, logout }}
    >
      {children}
    </AuthContext.Provider>
  )
}
