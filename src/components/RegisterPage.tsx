import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, useNavigate } from "react-router-dom"
import { useTheme } from "./ThemeProvider"
import { Button } from "./ui/button"
import { cn } from "@/lib/utils"

export default function RegisterPage() {
  const { t, i18n } = useTranslation()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const [username, setUsername] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [agreeTerms, setAgreeTerms] = useState(false)

  return (
    <div className="auth-layout">
      {/* Left brand panel */}
      <div className="auth-brand">
        <div className="auth-blob auth-blob-1" />
        <div className="auth-blob auth-blob-2" />
        <div className="auth-blob auth-blob-3" />
        <div className="auth-blob auth-blob-4" />

        <div className="auth-brand-content animate-fade-in">
          <div className="auth-brand-logo">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
            </svg>
          </div>
          <h1 className="text-4xl font-bold mb-3 font-heading tracking-tight">AureStream</h1>
          <p className="text-lg opacity-90 mb-2 font-medium">{t("brand_tagline")}</p>
          <p className="text-sm opacity-70 max-w-xs leading-relaxed mx-auto">{t("brand_description")}</p>
        </div>
      </div>

      {/* Right form panel */}
      <div className="auth-form-side">
        <div className="auth-form-container">
          {/* Top controls */}
          <div className="flex justify-end gap-2 mb-10">
            <button
              className="nav-item !w-auto !p-2"
              onClick={toggleTheme}
              title={theme === "light" ? "深色模式" : "浅色模式"}
            >
              {theme === "light" ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
              )}
            </button>
            <div className="lang-selector">
              <button className={cn("lang-option", i18n.language === "en" && "active")} onClick={() => i18n.changeLanguage("en")}>EN</button>
              <button className={cn("lang-option", i18n.language.startsWith("zh") && "active")} onClick={() => i18n.changeLanguage("zh")}>中</button>
            </div>
          </div>

          {/* Header */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-2 font-heading">{t("register")}</h2>
            <p className="text-sm text-text-secondary">{t("register_subtitle")}</p>
          </div>

          {/* Form */}
          <form onSubmit={(e) => { e.preventDefault(); if (password !== confirmPassword) return; navigate("/dashboard") }} className="flex flex-col gap-4">
            <div>
              <label className="block text-[13px] font-medium mb-1.5 text-text-secondary" htmlFor="register-username">{t("username")}</label>
              <div className="input-group">
                <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                <input id="register-username" className="input" type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" required autoComplete="username" />
              </div>
            </div>

            <div>
              <label className="block text-[13px] font-medium mb-1.5 text-text-secondary" htmlFor="register-email">{t("email")}</label>
              <div className="input-group">
                <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                <input id="register-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" required autoComplete="email" />
              </div>
            </div>

            <div>
              <label className="block text-[13px] font-medium mb-1.5 text-text-secondary" htmlFor="register-password">{t("password")}</label>
              <div className="input-group">
                <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                <input id="register-password" className="input" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required autoComplete="new-password" />
                <button type="button" className="input-action" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  )}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[13px] font-medium mb-1.5 text-text-secondary" htmlFor="register-confirm">{t("confirm_password")}</label>
              <div className="input-group">
                <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                <input id="register-confirm" className="input" type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" required autoComplete="new-password" />
              </div>
              {confirmPassword && password !== confirmPassword && (
                <p className="text-xs text-danger mt-1.5">密码不一致</p>
              )}
            </div>

            <label className="checkbox-wrapper">
              <input type="checkbox" checked={agreeTerms} onChange={(e) => setAgreeTerms(e.target.checked)} />
              <span>{t("agree_terms")}</span>
            </label>

            <Button type="submit" variant="gradient" size="lg" className="w-full">{t("sign_up")}</Button>
          </form>

          <div className="text-center mt-7">
            <span className="text-sm text-text-secondary">{t("has_account")} </span>
            <Link to="/login" className="text-sm text-primary font-semibold no-underline hover:opacity-80">{t("sign_in")}</Link>
          </div>

          <div className="text-center mt-10 text-xs text-text-muted">
            AureStream v0.2.5 · &copy; 2026 {t("all_rights_reserved")}
          </div>
        </div>
      </div>
    </div>
  )
}
