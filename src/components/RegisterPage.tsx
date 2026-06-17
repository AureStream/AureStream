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
      await register(email, password)
      navigate("/dashboard")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="w-full max-w-[380px] animate-fade-in-up">
      <div className="mb-8">
        <h2 className="text-3xl font-heading font-bold text-text mb-2">{t("register")}</h2>
        <p className="text-[15px] text-text-secondary">{t("register_subtitle")}</p>
      </div>

      {error && (
        <div className="mb-5 p-3.5 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm font-medium">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">

        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-bold text-text-secondary ml-1">{t("email")}</label>
          <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-surface-active/50 border border-border-glass focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/50 transition-all shadow-sm">
            <div className="text-text-muted"><I.Mail /></div>
            <input
              className="flex-1 bg-transparent border-none outline-none text-text text-sm placeholder:text-text-muted/60"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              required
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-bold text-text-secondary ml-1">{t("password")}</label>
          <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-surface-active/50 border border-border-glass focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/50 transition-all shadow-sm">
            <div className="text-text-muted"><I.Lock /></div>
            <input
              className="flex-1 bg-transparent border-none outline-none text-text text-sm placeholder:text-text-muted/60 tracking-wider"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
            <button
              type="button"
              className="text-text-muted hover:text-text transition-colors"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <I.EyeOff /> : <I.Eye />}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-bold text-text-secondary ml-1">{t("confirm_password")}</label>
          <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-surface-active/50 border border-border-glass focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/50 transition-all shadow-sm">
            <div className="text-text-muted"><I.Lock /></div>
            <input
              className="flex-1 bg-transparent border-none outline-none text-text text-sm placeholder:text-text-muted/60 tracking-wider"
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3.5 rounded-2xl bg-primary hover:bg-primary-hover active:scale-[0.98] transition-all text-text-inverse font-bold shadow-sm mt-4 text-[15px] disabled:opacity-60"
        >
          {submitting ? "..." : t("sign_up")}
        </button>
      </form>

      <div className="mt-8 text-center text-[13px] text-text-secondary">
        {t("has_account")}{" "}
        <Link to="/login" className="font-bold text-primary hover:text-primary-hover transition-colors ml-1">
          {t("sign_in")}
        </Link>
      </div>
    </div>
  )
}
