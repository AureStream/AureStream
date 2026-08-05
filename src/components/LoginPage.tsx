import { FormEvent, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { AuthError } from "@/lib/auth-errors";

export default function LoginPage() {
  const { user, authLoading, login } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [successMessage] = useState(() => {
    const state = location.state as { message?: string } | null;
    return state?.message ?? "";
  });

  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof AuthError ? err.message : "登录失败");
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <p className="auth-brand">AureStream</p>
        <h1 className="auth-title">登录</h1>
        <p className="auth-subtitle">使用邮箱账号继续</p>

        {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}
        {successMessage ? (
          <div className="auth-alert auth-alert-ok">{successMessage}</div>
        ) : null}

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-label" htmlFor="login-email">
            邮箱
          </label>
          <input
            id="login-email"
            className="auth-input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <label className="auth-label" htmlFor="login-password">
            密码
          </label>
          <input
            id="login-password"
            className="auth-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <button className="auth-btn" type="submit" disabled={authLoading}>
            {authLoading ? "请稍候…" : "登录"}
          </button>
        </form>

        <p className="auth-footer">
          还没有账号？{" "}
          <Link className="auth-link" to="/register">
            注册
          </Link>
        </p>
      </div>
    </div>
  );
}
