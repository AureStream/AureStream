import { apiFetch, setTokens, clearTokens } from "./client"

export interface User {
  id: string
  email: string
  created_at: number
}

export interface AuthResult {
  access_token: string
  refresh_token: string
  expires_in: number
  user: User
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const res = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? "Login failed")
  }
  const data = await res.json()
  setTokens(data.access_token, data.refresh_token)
  return data
}

export async function register(email: string, password: string): Promise<any> {
  const res = await apiFetch("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? "Registration failed")
  }
  const data = await res.json()
  return data
}

export async function logout(): Promise<void> {
  const refreshToken = localStorage.getItem("aurestream_refresh_token")
  if (refreshToken) {
    await apiFetch("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken }),
    }).catch(() => {})
  }
  clearTokens()
}

export async function refreshToken(): Promise<boolean> {
  const rt = localStorage.getItem("aurestream_refresh_token")
  if (!rt) return false
  try {
    const res = await fetch(`${import.meta.env.VITE_API_URL ?? "https://aurestream.chilix.qzz.io/api"}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: rt }),
    })
    if (!res.ok) return false
    const data = await res.json()
    setTokens(data.access_token, data.refresh_token)
    return true
  } catch {
    return false
  }
}

export { setTokens, clearTokens, hasTokens } from "./client"
