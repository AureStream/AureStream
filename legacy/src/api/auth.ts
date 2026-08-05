import { apiFetch, setTokens, clearTokens, API_BASE } from "./client"

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

/** `POST /auth/register` 202 body — code sent, user not created yet. */
export interface RegisterPendingResult {
  email: string
  expires_in: number
}

export class AuthApiError extends Error {
  readonly code: string
  readonly status: number
  readonly retryAfter?: number

  constructor(code: string, status: number, retryAfter?: number) {
    super(authErrorMessage(code, retryAfter))
    this.name = "AuthApiError"
    this.code = code
    this.status = status
    this.retryAfter = retryAfter
  }
}

export function authErrorMessage(code: string, retryAfter?: number): string {
  switch (code) {
    case "email_already_registered":
      return "该邮箱已注册"
    case "resend_too_soon":
      return retryAfter != null
        ? `发送过于频繁，请 ${retryAfter} 秒后再试`
        : "发送过于频繁，请稍后再试"
    case "email_send_failed":
      return "验证码发送失败，请稍后重试"
    case "invalid_code":
      return "验证码错误"
    case "code_expired":
      return "验证码已过期，请重新获取"
    case "invalid_credentials":
      return "邮箱或密码错误"
    case "invalid_request":
      return "请求参数无效"
    default:
      return code || "操作失败"
  }
}

async function readAuthError(res: Response): Promise<AuthApiError> {
  const body = await res.json().catch(() => ({} as Record<string, unknown>))
  const code = typeof body.error === "string" ? body.error : "request_failed"
  const retryAfter =
    typeof body.retry_after === "number" ? body.retry_after : undefined
  return new AuthApiError(code, res.status, retryAfter)
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const res = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw await readAuthError(res)
  const data = (await res.json()) as AuthResult
  setTokens(data.access_token, data.refresh_token)
  return data
}

/** Start registration: send 6-digit email code (does not create user). */
export async function register(
  email: string,
  password: string,
): Promise<RegisterPendingResult> {
  const res = await apiFetch("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw await readAuthError(res)
  return (await res.json()) as RegisterPendingResult
}

/** Verify email code and create the user account. */
export async function verifyRegister(
  email: string,
  code: string,
): Promise<{ user: User }> {
  const res = await apiFetch("/auth/register/verify", {
    method: "POST",
    body: JSON.stringify({ email, code }),
  })
  if (!res.ok) throw await readAuthError(res)
  return (await res.json()) as { user: User }
}

/** Revoke refresh token on the server. Does not touch local tokens. */
export async function revokeRemoteSession(): Promise<void> {
  const refreshToken = localStorage.getItem("aurestream_refresh_token")
  if (!refreshToken) return
  await apiFetch("/auth/logout", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  }).catch(() => {})
}

export async function logout(): Promise<void> {
  try {
    await revokeRemoteSession()
  } finally {
    clearTokens()
  }
}

export async function refreshToken(): Promise<boolean> {
  const rt = localStorage.getItem("aurestream_refresh_token")
  if (!rt) return false
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
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
