import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, useNavigate } from "react-router-dom"
import { useAuth } from "../contexts/AuthContext"

/* ── Icons ── */
const I = {
  Mail: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>),
  Lock: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>),
  Eye: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>),
  EyeOff: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>),
}

export default function RegisterPage() {
  const { t } = useTranslation()
  const { register } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
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
    <div className="w-full">
      <div className="mb-8 text-center">
        <h2 className="text-3.5xl font-heading font-extrabold tracking-tight bg-gradient-to-r from-secondary to-accent-purple bg-clip-text text-transparent">{t("register")}</h2>
      </div>

      {error && (
        <div className="mb-5 p-3.5 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm font-medium">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">

        <div className="flex flex-col gap-2">
          <label className="text-xs font-extrabold text-text-secondary/80 ml-1 uppercase tracking-wider">{t("email")}</label>
          <div className="glass-input flex items-center gap-3 px-4.5 py-4 rounded-[20px]">
            <div className="text-text-muted/80"><I.Mail /></div>
            <input
              className="flex-1 bg-transparent border-none outline-none text-text text-[14px] placeholder:text-text-muted/40 font-semibold"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("email_placeholder", "请输入您的邮箱地址")}
              required
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-extrabold text-text-secondary/80 ml-1 uppercase tracking-wider">{t("password")}</label>
          <div className="glass-input flex items-center gap-3 px-4.5 py-4 rounded-[20px]">
            <div className="text-text-muted/80"><I.Lock /></div>
            <input
              className="flex-1 bg-transparent border-none outline-none text-text text-[14px] placeholder:text-text-muted/40 font-semibold tracking-wider"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("password_placeholder", "请输入您的密码")}
              required
            />
            <button
              type="button"
              className="text-text-muted/80 hover:text-text transition-colors"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <I.EyeOff /> : <I.Eye />}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-extrabold text-text-secondary/80 ml-1 uppercase tracking-wider">{t("confirm_password")}</label>
          <div className="glass-input flex items-center gap-3 px-4.5 py-4 rounded-[20px]">
            <div className="text-text-muted/80"><I.Lock /></div>
            <input
              className="flex-1 bg-transparent border-none outline-none text-text text-[14px] placeholder:text-text-muted/40 font-semibold tracking-wider"
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t("confirm_placeholder", "请再次输入密码以确认")}
              required
            />
            <button
              type="button"
              className="text-text-muted/80 hover:text-text transition-colors"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            >
              {showConfirmPassword ? <I.EyeOff /> : <I.Eye />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-4 rounded-[20px] bg-secondary hover:bg-secondary/90 active:scale-[0.98] transition-all text-white font-extrabold shadow-md mt-4 text-[15px] disabled:opacity-60 cursor-pointer uppercase tracking-wider flex items-center justify-center gap-2"
        >
          {submitting ? (
            <>
              <span className="w-4 h-4 rounded-full border-2 border-t-transparent border-white animate-spin shrink-0" />
              <span>{t("submitting", "请稍候...")}</span>
            </>
          ) : (
            t("sign_up")
          )}
        </button>
      </form>

      <div className="mt-8 text-center text-[13px] text-text-secondary">
        {t("has_account")}{" "}
        <Link to="/login" className="font-bold text-secondary hover:text-secondary/80 transition-colors ml-1">
          {t("sign_in")}
        </Link>
      </div>
    </div>
  )
}
