import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useAuth } from "../contexts/AuthContext"

/* ── Icons ── */
const I = {
  Mail: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>),
  Lock: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>),
  Eye: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>),
  EyeOff: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-4.57"/><path d="m2 2 20 20"/></svg>),
}

export default function RegisterPage() {
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
      setError("两次输入的密码不一致")
      return
    }
    if (password.length < 6) {
      setError("密码至少 6 位")
      return
    }
    setSubmitting(true)
    try {
      try {
        const { clearLocalUserData } = await import("../lib/auth-cleanup")
        await clearLocalUserData()
      } catch (cleanErr) {
        console.error("Failed to clear local user data before registration:", cleanErr)
      }

      await register(email, password)
      navigate("/login", { state: { message: "注册成功！请使用新账号登录" } })
    } catch (err) {
      setError(err instanceof Error ? err.message : "注册失败")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex h-full w-full flex-col px-10 pb-7 pt-10 animate-fade-in">
      <div className="pt-18 text-center">
        <p className="text-[26px] font-black leading-tight tracking-tight text-slate-800 dark:text-text">欢迎使用 AureStream</p>
        <p className="mt-3 text-[14px] font-semibold text-[#6C5CFF]">安全、快速、简洁的网络连接体验</p>
      </div>

      <div className="absolute left-10 right-10 top-1/2 -translate-y-1/2">
        <div className="flex flex-col gap-5">
        {error && (
          <div className="rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <label className="flex h-15 items-center gap-4 rounded-full border border-slate-300/80 bg-white/55 px-5 text-slate-500 shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-white/10">
            <I.Mail />
            <span className="sr-only">邮箱</span>
            <input
              className="min-w-0 flex-1 border-none bg-transparent text-[16px] font-semibold text-slate-700 outline-none placeholder:text-slate-500 dark:text-text dark:placeholder:text-text-muted"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="邮箱"
              required
            />
          </label>

          <label className="flex h-15 items-center gap-4 rounded-full border border-slate-300/80 bg-white/55 px-5 text-slate-500 shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-white/10">
            <I.Lock />
            <span className="sr-only">密码</span>
            <input
              className="min-w-0 flex-1 border-none bg-transparent text-[16px] font-semibold text-slate-700 outline-none placeholder:text-slate-500 dark:text-text dark:placeholder:text-text-muted [&::-ms-reveal]:hidden [&::-ms-clear]:hidden"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="密码"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:text-slate-600 dark:text-text-muted dark:hover:text-text"
              aria-label={showPassword ? "隐藏密码" : "显示密码"}
            >
              {showPassword ? <I.EyeOff /> : <I.Eye />}
            </button>
          </label>

          <label className="flex h-15 items-center gap-4 rounded-full border border-slate-300/80 bg-white/55 px-5 text-slate-500 shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-white/10">
            <I.Lock />
            <span className="sr-only">确认密码</span>
            <input
              className="min-w-0 flex-1 border-none bg-transparent text-[16px] font-semibold text-slate-700 outline-none placeholder:text-slate-500 dark:text-text dark:placeholder:text-text-muted [&::-ms-reveal]:hidden [&::-ms-clear]:hidden"
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="确认密码"
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((value) => !value)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:text-slate-600 dark:text-text-muted dark:hover:text-text"
              aria-label={showConfirmPassword ? "隐藏密码" : "显示密码"}
            >
              {showConfirmPassword ? <I.EyeOff /> : <I.Eye />}
            </button>
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="mt-8 flex h-15 w-full cursor-pointer items-center justify-center rounded-full bg-[#6C5CFF] text-base font-extrabold text-white shadow-md transition-all hover:bg-[#6252F4] active:scale-[0.98] disabled:opacity-60"
          >
            {submitting ? (
              <>
                <span className="mr-2 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>请稍候...</span>
              </>
            ) : (
              "注册"
            )}
          </button>
        </form>
        </div>
      </div>

      <div className="mt-auto text-center text-[14px] font-medium text-slate-800 dark:text-text-secondary">
        已有账号？{" "}
        <Link to="/login" className="font-extrabold text-[#6C5CFF] transition-colors hover:text-[#6252F4]">
          登录
        </Link>
      </div>
    </div>
  )
}
