const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8787"

let accessToken: string | null = localStorage.getItem("aurestream_access_token")
let refreshToken: string | null = localStorage.getItem("aurestream_refresh_token")

export function setTokens(access: string, refresh: string) {
  accessToken = access
  refreshToken = refresh
  localStorage.setItem("aurestream_access_token", access)
  localStorage.setItem("aurestream_refresh_token", refresh)
}

export function clearTokens() {
  accessToken = null
  refreshToken = null
  localStorage.removeItem("aurestream_access_token")
  localStorage.removeItem("aurestream_refresh_token")
}

export function hasTokens(): boolean {
  return !!accessToken
}

async function tryRefresh(): Promise<boolean> {
  if (!refreshToken) return false
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
    if (!res.ok) return false
    const data = await res.json()
    setTokens(data.access_token, data.refresh_token)
    return true
  } catch {
    return false
  }
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> ?? {}),
  }
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`

  let res = await fetch(`${API_BASE}${path}`, { ...options, headers })

  // Auto-refresh on 401, retry once
  if (res.status === 401 && refreshToken) {
    const ok = await tryRefresh()
    if (ok) {
      headers["Authorization"] = `Bearer ${accessToken}`
      res = await fetch(`${API_BASE}${path}`, { ...options, headers })
    }
  }

  return res
}
