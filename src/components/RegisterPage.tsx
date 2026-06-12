import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, useNavigate } from "react-router-dom"

/* ── Icons ── */
const I = {
  Mail: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>),
  User: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>),
  Lock: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>),
  Eye: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>),
  EyeOff: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>),
  Rocket: () => (<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>),
}

export default function RegisterPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  
  const [username, setUsername] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)

  return (
    <div className="w-full max-w-[380px] animate-fade-in-up">
      {/* Mobile Logo (Visible only on small screens) */}
      <div className="md:hidden flex items-center gap-3 mb-10">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white shadow-sm border border-white/20">
          <I.Rocket />
        </div>
        <span className="text-2xl font-heading font-bold text-text tracking-tight">AureStream</span>
      </div>

      <div className="mb-8">
        <h2 className="text-3xl font-heading font-bold text-text mb-2">{t("register")}</h2>
        <p className="text-[15px] text-text-secondary">{t("register_subtitle")}</p>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); if (password !== confirmPassword) return; navigate("/dashboard") }} className="flex flex-col gap-4">
        
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-bold text-text-secondary ml-1">{t("username")}</label>
          <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-surface-active/50 border border-border-glass focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/50 transition-all shadow-sm">
            <div className="text-text-muted"><I.User /></div>
            <input 
              className="flex-1 bg-transparent border-none outline-none text-text text-sm placeholder:text-text-muted/60" 
              type="text" 
              value={username} 
              onChange={(e) => setUsername(e.target.value)} 
              placeholder="username" 
              required 
            />
          </div>
        </div>

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
          <label className="text-[13px] font-bold text-text-secondary ml-1">{t("confirm_password", "确认密码")}</label>
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

        <button type="submit" className="w-full py-3.5 rounded-2xl bg-primary hover:bg-primary-hover active:scale-[0.98] transition-all text-white font-bold shadow-sm mt-4 text-[15px]">
          {t("sign_up")}
        </button>
      </form>

      <div className="mt-8 text-center text-[13px] text-text-secondary">
        {t("already_have_account")}{" "}
        <Link to="/login" className="font-bold text-primary hover:text-primary-hover transition-colors ml-1">
          {t("sign_in")}
        </Link>
      </div>
    </div>
  )
}
