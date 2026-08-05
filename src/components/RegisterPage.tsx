import { FormEvent, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { AuthError } from "@/lib/auth-errors";

type Step = "credentials" | "verify";

const DEFAULT_RESEND_COOLDOWN = 60;

export default function RegisterPage() {
  const { user, authLoading, register, verifyAndLogin } = useAuth();
  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [resendIn]);

  if (user) {
    return <Navigate to="/" replace />;
  }

  const startResendCooldown = (seconds: number = DEFAULT_RESEND_COOLDOWN) => {
    setResendIn(Math.max(0, Math.ceil(seconds)));
  };

  const sendCode = async () => {
    const pending = await register(email.trim(), password);
    setInfo(`验证码已发送至 ${pending.email}，${pending.expires_in} 秒内有效`);
    startResendCooldown(DEFAULT_RESEND_COOLDOWN);
    setStep("verify");
  };

  const handleCredentialsSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setInfo("");
    if (password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }
    if (password.length < 6) {
      setError("密码至少 6 位");
      return;
    }
    try {
      await sendCode();
    } catch (err) {
      if (err instanceof AuthError && err.code === "resend_too_soon") {
        startResendCooldown(err.retryAfter ?? DEFAULT_RESEND_COOLDOWN);
      }
      setError(err instanceof AuthError ? err.message : "注册失败");
    }
  };

  const handleVerifySubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const normalized = code.replace(/\s/g, "");
    if (!/^\d{6}$/.test(normalized)) {
      setError("请输入 6 位数字验证码");
      return;
    }
    try {
      await verifyAndLogin(email.trim(), password, normalized);
    } catch (err) {
      setError(err instanceof AuthError ? err.message : "验证失败");
    }
  };

  const handleResend = async () => {
    if (resendIn > 0 || authLoading) return;
    setError("");
    setInfo("");
    try {
      await sendCode();
    } catch (err) {
      if (err instanceof AuthError && err.code === "resend_too_soon") {
        startResendCooldown(err.retryAfter ?? DEFAULT_RESEND_COOLDOWN);
      }
      setError(err instanceof AuthError ? err.message : "重发失败");
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <p className="auth-brand">AureStream</p>
        <h1 className="auth-title">{step === "verify" ? "验证邮箱" : "创建账号"}</h1>
        <p className="auth-subtitle">
          {step === "verify"
            ? `验证码已发送到 ${email.trim()}`
            : "填写邮箱与密码，完成两步注册"}
        </p>

        {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}
        {info && !error ? (
          <div className="auth-alert auth-alert-ok">{info}</div>
        ) : null}

        {step === "credentials" ? (
          <form className="auth-form" onSubmit={handleCredentialsSubmit}>
            <label className="auth-label" htmlFor="reg-email">
              邮箱
            </label>
            <input
              id="reg-email"
              className="auth-input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <label className="auth-label" htmlFor="reg-password">
              密码
            </label>
            <input
              id="reg-password"
              className="auth-input"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />

            <label className="auth-label" htmlFor="reg-confirm">
              确认密码
            </label>
            <input
              id="reg-confirm"
              className="auth-input"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
            />

            <button className="auth-btn" type="submit" disabled={authLoading}>
              {authLoading ? "发送中…" : "发送验证码"}
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleVerifySubmit}>
            <label className="auth-label" htmlFor="reg-code">
              验证码
            </label>
            <input
              id="reg-code"
              className="auth-input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="6 位数字"
              required
            />

            <button className="auth-btn" type="submit" disabled={authLoading}>
              {authLoading ? "验证中…" : "验证并登录"}
            </button>

            <button
              className="auth-btn-secondary"
              type="button"
              disabled={authLoading || resendIn > 0}
              onClick={handleResend}
            >
              {resendIn > 0 ? `${resendIn} 秒后可重发` : "重新发送验证码"}
            </button>

            <button
              className="auth-btn-secondary"
              type="button"
              disabled={authLoading}
              onClick={() => {
                setStep("credentials");
                setCode("");
                setError("");
                setInfo("");
              }}
            >
              返回修改邮箱
            </button>
          </form>
        )}

        <p className="auth-footer">
          已有账号？{" "}
          <Link className="auth-link" to="/login">
            登录
          </Link>
        </p>
      </div>
    </div>
  );
}
