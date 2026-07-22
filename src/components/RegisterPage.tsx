import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, useNavigate } from "react-router-dom"
import { useAuth } from "../contexts/AuthContext"

/* ── Icons ── */
const I = {
  Mail: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>),
  Lock: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>),
}

export default function RegisterPage() {
  const { t } = useTranslation()
  const { register } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (password !== confirmPassword) {
      setError(t("confirm_password_mismatch", "Passwords do not match"))
      return
    }
    if (password.length < 6) {
      setError(t("password_too_short", "Password must be at least 6 characters"))
      return
    }
    setSubmitting(true)
    try {
      // Clear old local user data before registration starts
      try {
        const { clearLocalUserData } = await import("../lib/auth-cleanup")
        await clearLocalUserData()
      } catch (cleanErr) {
        console.error("Failed to clear local user data before registration:", cleanErr)
      }

      await register(email, password)
      navigate("/login", { state: { message: t("register_success_please_login", "注册成功！请使用新账号登录") } })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex h-full w-full flex-col px-5 pb-6 pt-16 animate-fade-in">
      <div className="flex flex-col gap-2 pt-6">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-secondary to-accent-purple text-white shadow-glow-primary">
          <I.Mail />
        </div>
        <h1 className="mt-3 text-3.5xl font-heading font-extrabold tracking-tight text-text">{t("register")}</h1>
        <p className="max-w-[18rem] text-sm font-medium leading-relaxed text-text-secondary">
          {t("register_subtitle", "创建账号，开始管理你的专属代理连接。")}
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-3">
        {error && (
          <div className="rounded-2xl border border-danger/20 bg-danger/10 p-3.5 text-sm font-medium text-danger">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="glass-card flex flex-col gap-4 rounded-[28px] p-5 shadow-glass">
          <div className="flex flex-col gap-2">
            <label className="ml-1 text-xs font-extrabold uppercase tracking-wider text-text-secondary/80">{t("email")}</label>
            <div className="glass-input flex items-center gap-3 rounded-[20px] px-4.5 py-4">
              <div className="text-text-muted/80"><I.Mail /></div>
              <input
                className="flex-1 border-none bg-transparent text-[14px] font-semibold text-text outline-none placeholder:text-text-muted/40"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("email_placeholder", "请输入您的邮箱地址")}
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="ml-1 text-xs font-extrabold uppercase tracking-wider text-text-secondary/80">{t("password")}</label>
            <div className="glass-input flex items-center gap-3 rounded-[20px] px-4.5 py-4">
              <div className="text-text-muted/80"><I.Lock /></div>
              <input
                className="flex-1 border-none bg-transparent text-[14px] font-semibold tracking-wider text-text outline-none placeholder:text-text-muted/40"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("password_placeholder", "请输入您的密码")}
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="ml-1 text-xs font-extrabold uppercase tracking-wider text-text-secondary/80">{t("confirm_password")}</label>
            <div className="glass-input flex items-center gap-3 rounded-[20px] px-4.5 py-4">
              <div className="text-text-muted/80"><I.Lock /></div>
              <input
                className="flex-1 border-none bg-transparent text-[14px] font-semibold tracking-wider text-text outline-none placeholder:text-text-muted/40"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t("confirm_placeholder", "请再次输入密码以确认")}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-[20px] bg-secondary py-4 text-[15px] font-extrabold uppercase tracking-wider text-white shadow-md transition-all hover:bg-secondary/90 active:scale-[0.98] disabled:opacity-60"
          >
            {submitting ? (
              <>
                <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>{t("submitting", "请稍候...")}</span>
              </>
            ) : (
              t("sign_up")
            )}
          </button>
        </form>
      </div>

      <div className="flex-1" />

      <div className="text-center text-[13px] text-text-secondary">
        {t("has_account")}{" "}
        <Link to="/login" className="ml-1 font-bold text-secondary transition-colors hover:text-secondary/80">
          {t("sign_in")}
        </Link>
      </div>
    </div>
  )
}
