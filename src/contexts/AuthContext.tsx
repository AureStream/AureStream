import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"
import { type User, login as apiLogin, register as apiRegister, logout as apiLogout, refreshToken, hasTokens } from "../api/auth"
import { apiFetch } from "../api/client"

interface AuthState {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // On mount, try to fetch current user from stored token
  useEffect(() => {
    if (!hasTokens()) {
      setLoading(false)
      return
    }
    ;(async () => {
      try {
        // If token expired, try refresh first
        const res = await apiFetch("/user/me")
        if (res.ok) {
          setUser(await res.json())
        } else {
          // Try to refresh and retry
          const refreshed = await refreshToken()
          if (refreshed) {
            const retry = await apiFetch("/user/me")
            if (retry.ok) setUser(await retry.json())
          }
        }
      } catch {
        // Silently fail — user will need to login again
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const result = await apiLogin(email, password)
    setUser(result.user)
  }, [])

  const register = useCallback(async (email: string, password: string) => {
    await apiRegister(email, password)
  }, [])

  const logout = useCallback(async () => {
    // Clear tokens on the backend & localStorage
    await apiLogout()
    // Clear local databases, stores and latency caches
    try {
      const { clearLocalUserData } = await import("../lib/auth-cleanup")
      await clearLocalUserData()
    } catch (e) {
      console.error("Failed to clean local user data on logout:", e)
    }
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
