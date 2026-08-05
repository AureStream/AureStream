import { describe, expect, it } from "vitest";
import { authErrorMessage, parseAuthInvokeError } from "./auth-errors";

describe("authErrorMessage", () => {
  it("maps email_already_registered to Chinese", () => {
    expect(authErrorMessage("email_already_registered")).toBe("该邮箱已注册");
  });

  it("includes retry_after for resend_too_soon", () => {
    expect(authErrorMessage("resend_too_soon", 30)).toBe(
      "发送过于频繁，请 30 秒后再试",
    );
  });

  it("falls back without retry_after for resend_too_soon", () => {
    expect(authErrorMessage("resend_too_soon")).toBe(
      "发送过于频繁，请稍后再试",
    );
  });

  it("maps remaining Worker codes", () => {
    expect(authErrorMessage("email_send_failed")).toBe(
      "验证码发送失败，请稍后重试",
    );
    expect(authErrorMessage("invalid_code")).toBe("验证码错误");
    expect(authErrorMessage("code_expired")).toBe("验证码已过期，请重新获取");
    expect(authErrorMessage("invalid_credentials")).toBe("邮箱或密码错误");
    expect(authErrorMessage("invalid_request")).toBe("请求参数无效");
  });

  it("falls back for unknown codes", () => {
    expect(authErrorMessage("weird_code")).toBe("weird_code");
    expect(authErrorMessage("")).toBe("操作失败");
  });
});

describe("parseAuthInvokeError", () => {
  it("parses structured IPC payload", () => {
    const err = parseAuthInvokeError({
      code: "invalid_credentials",
      status: 401,
      retry_after: null,
    });
    expect(err.code).toBe("invalid_credentials");
    expect(err.status).toBe(401);
    expect(err.message).toBe("邮箱或密码错误");
  });

  it("parses JSON string payload from Tauri", () => {
    const err = parseAuthInvokeError(
      JSON.stringify({
        code: "resend_too_soon",
        status: 429,
        retry_after: 12,
      }),
    );
    expect(err.retryAfter).toBe(12);
    expect(err.message).toContain("12");
  });
});
