import { beforeAll, describe, expect, it } from "vitest"

const memory = new Map<string, string>()
;(globalThis as typeof globalThis & { localStorage: Storage }).localStorage = {
  get length() {
    return memory.size
  },
  clear: () => memory.clear(),
  getItem: (key: string) => memory.get(key) ?? null,
  key: (index: number) => [...memory.keys()][index] ?? null,
  removeItem: (key: string) => {
    memory.delete(key)
  },
  setItem: (key: string, value: string) => {
    memory.set(key, value)
  },
}

let authErrorMessage: typeof import("./auth").authErrorMessage
let AuthApiError: typeof import("./auth").AuthApiError

beforeAll(async () => {
  ;({ authErrorMessage, AuthApiError } = await import("./auth"))
})

describe("authErrorMessage", () => {
  it("maps register / verify codes to Chinese", () => {
    expect(authErrorMessage("email_already_registered")).toBe("该邮箱已注册")
    expect(authErrorMessage("invalid_code")).toBe("验证码错误")
    expect(authErrorMessage("code_expired")).toBe("验证码已过期，请重新获取")
    expect(authErrorMessage("email_send_failed")).toBe("验证码发送失败，请稍后重试")
    expect(authErrorMessage("resend_too_soon", 45)).toBe("发送过于频繁，请 45 秒后再试")
  })
})

describe("AuthApiError", () => {
  it("exposes code, status and retryAfter", () => {
    const err = new AuthApiError("resend_too_soon", 429, 30)
    expect(err.message).toBe("发送过于频繁，请 30 秒后再试")
    expect(err.code).toBe("resend_too_soon")
    expect(err.status).toBe(429)
    expect(err.retryAfter).toBe(30)
  })
})
