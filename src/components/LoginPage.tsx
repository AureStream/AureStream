import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, useNavigate, useLocation } from "react-router-dom"
import { useAuth } from "../contexts/AuthContext"
import { fetchSubscriptions } from "../api/subscriptions"
import { setStoreValue } from "../single/store"
import { syncActiveConnectionConfig } from "../lib/config-sync"
import { SSI_STORE_KEY } from "../types/definition"
import { insertSubscription } from "../action/db"

/* ── Icons ── */
const I = {
  Mail: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>),
  Lock: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>),
  Check: () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>),
}

export default function LoginPage() {
  const { t } = useTranslation()
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [successMessage] = useState<string>(() => {
    const msg = location.state?.message || ""
    if (msg) {
      setTimeout(() => {
        window.history.replaceState({}, document.title)
      }, 0)
    }
    return msg
  })
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSubmitting(true)
    try {
      // Clear old local user data before new login starts
      try {
        const { clearLocalUserData } = await import("../lib/auth-cleanup")
        await clearLocalUserData()
      } catch (cleanErr) {
        console.error("Failed to clear local user data before login:", cleanErr)
      }

      await login(email, password)
      
      // Auto fetch and sync subscriptions immediately after login
      try {
        const subs = await fetchSubscriptions()
        if (subs && subs.length > 0) {
          await setStoreValue(SSI_STORE_KEY, subs[0].id)
          try {
            await insertSubscription(subs[0].url, subs[0].name, subs[0].id)
          } catch (dbErr) {
            console.error("Failed to save subscription config to local DB:", dbErr)
          }
          await syncActiveConnectionConfig("login-init")
        }
      } catch (subErr) {
        console.error("Failed to initialize subscriptions after login:", subErr)
      }

      navigate("/dashboard")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="w-full">
      <div className="mb-8 text-center">
        <h2 className="text-3.5xl font-heading font-extrabold tracking-tight bg-gradient-to-r from-secondary to-accent-purple bg-clip-text text-transparent">{t("welcome_back")}</h2>
      </div>

      {error && (
        <div className="mb-5 p-3.5 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm font-medium">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="mb-5 p-3.5 rounded-xl bg-success/10 border border-success/20 text-success text-sm font-medium">
          {successMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">

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
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("password_placeholder", "请输入您的密码")}
              required
            />
          </div>
        </div>

        <div className="flex items-center justify-end mt-1">
          <a href="#" className="text-[13px] font-bold text-secondary hover:text-secondary/80 transition-colors">{t("forgot_password")}</a>
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
            t("sign_in")
          )}
        </button>
      </form>

      <div className="mt-8 text-center text-[13px] text-text-secondary">
        {t("no_account")}{" "}
        <Link to="/register" className="font-bold text-secondary hover:text-secondary/80 transition-colors ml-1">
          {t("sign_up")}
        </Link>
      </div>
    </div>
  )
}
