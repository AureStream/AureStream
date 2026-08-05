export type AuthIpcErrorPayload = {
  code: string;
  status: number;
  retry_after?: number | null;
};

export class AuthError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryAfter?: number;

  constructor(code: string, status: number, retryAfter?: number) {
    super(authErrorMessage(code, retryAfter));
    this.name = "AuthError";
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export function authErrorMessage(code: string, retryAfter?: number): string {
  switch (code) {
    case "email_already_registered":
      return "该邮箱已注册";
    case "resend_too_soon":
      return retryAfter != null
        ? `发送过于频繁，请 ${retryAfter} 秒后再试`
        : "发送过于频繁，请稍后再试";
    case "email_send_failed":
      return "验证码发送失败，请稍后重试";
    case "invalid_code":
      return "验证码错误";
    case "code_expired":
      return "验证码已过期，请重新获取";
    case "invalid_credentials":
      return "邮箱或密码错误";
    case "invalid_request":
      return "请求参数无效";
    default:
      return code || "操作失败";
  }
}

function isPayload(value: unknown): value is AuthIpcErrorPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as AuthIpcErrorPayload).code === "string" &&
    typeof (value as AuthIpcErrorPayload).status === "number"
  );
}

export function parseAuthInvokeError(raw: unknown): AuthError {
  let payload: unknown = raw;

  if (typeof raw === "string") {
    try {
      payload = JSON.parse(raw);
    } catch {
      return new AuthError(raw || "request_failed", 0);
    }
  }

  if (isPayload(payload)) {
    const retry =
      typeof payload.retry_after === "number" ? payload.retry_after : undefined;
    return new AuthError(payload.code, payload.status, retry);
  }

  if (raw instanceof Error) {
    return new AuthError(raw.message || "request_failed", 0);
  }

  return new AuthError("request_failed", 0);
}
