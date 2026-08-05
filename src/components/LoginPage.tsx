import { FormEvent, useState } from "react"
import { Link, Navigate, useLocation } from "react-router-dom"
import { Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { AuthError } from "@/lib/auth-errors"
import { AuthMobileField } from "@/components/auth-mobile-field"
import { cn } from "@/lib/utils"

const REMEMBER_KEY = "aurestream.auth.remember"

export default function LoginPage() {
  const { user, authLoading, login } = useAuth()
  const location = useLocation()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(() => {
    try {
      return localStorage.getItem(REMEMBER_KEY) === "1"
    } catch {
      return false
    }
  })
  const [error, setError] = useState("")
  const [info, setInfo] = useState("")
  const [successMessage] = useState(() => {
    const state = location.state as { message?: string } | null
    return state?.message ?? ""
  })

  if (user) {
    return <Navigate to="/" replace />
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError("")
    try {
      try {
        localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0")
      } catch {
        // ignore
      }
      await login(email.trim(), password)
    } catch (err) {
      setError(err instanceof AuthError ? err.message : "登录失败")
    }
  }

  const handleForgot = () => {
    setInfo("忘记密码功能即将推出，敬请期待。")
  }

  return (
    <div className="relative flex h-full w-full flex-col overflow-y-auto no-scrollbar bg-white px-8 animate-fade-in dark:bg-background">
      <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center py-8">
        <div className="flex w-full max-w-[320px] flex-col">
          <h1 className="mb-7 text-center text-[1.75rem] font-bold tracking-tight text-[#1a1d21] dark:text-foreground">
            登录
          </h1>

          {error ? (
            <div className="mb-4 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-2.5 text-sm font-medium text-destructive">
              {error}
            </div>
          ) : null}
          {successMessage ? (
            <div className="mb-4 rounded-2xl border border-success/20 bg-success/10 px-4 py-2.5 text-sm font-medium text-success">
              {successMessage}
            </div>
          ) : null}
          {info && !error ? (
            <div className="mb-4 rounded-2xl border border-[#eceef1] bg-[#f1f2f4] px-4 py-2.5 text-sm font-medium text-[#6b7280]">
              {info}
            </div>
          ) : null}

          <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-3.5">
            <AuthMobileField
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="邮箱地址"
              required
              aria-label="邮箱地址"
              icon={<Mail strokeWidth={1.75} />}
            />

            <AuthMobileField
              id="login-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="密码"
              required
              aria-label="密码"
              icon={<Lock strokeWidth={1.75} />}
              trailing={
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="shrink-0 rounded-full p-1 text-[#9aa0a6] transition-colors hover:text-[#1a1d21]"
                  aria-label={showPassword ? "隐藏密码" : "显示密码"}
                >
                  {showPassword ? (
                    <EyeOff className="size-[18px]" strokeWidth={1.75} />
                  ) : (
                    <Eye className="size-[18px]" strokeWidth={1.75} />
                  )}
                </button>
              }
            />

            <div className="flex items-center justify-between px-0.5 pt-0.5">
              <label className="flex cursor-pointer items-center gap-2 select-none">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="size-4 shrink-0 rounded border-[#cfd3d8] accent-[var(--auth-accent)]"
                />
                <span className="text-[13px] font-medium text-[#6b7280]">记住我</span>
              </label>
              <button
                type="button"
                onClick={handleForgot}
                className="text-[13px] font-semibold text-[var(--auth-accent)] transition-opacity hover:opacity-80"
              >
                忘记密码
              </button>
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className={cn(
                "mt-1 flex h-[3.25rem] w-full items-center justify-center gap-2 rounded-full",
                "bg-[var(--auth-accent)] text-[15px] font-semibold text-white",
                "shadow-[0_8px_20px_rgba(108,92,255,0.22)]",
                "transition-all active:scale-[0.98]",
                "disabled:pointer-events-none disabled:opacity-60",
              )}
            >
              {authLoading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  请稍候...
                </>
              ) : (
                "继续"
              )}
            </button>
          </form>

          <div className="mt-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-[#eceef1]" />
            <span className="text-[12px] font-medium text-[#9aa0a6]">还没有账号？</span>
            <div className="h-px flex-1 bg-[#eceef1]" />
          </div>

          <Link
            to="/register"
            className={cn(
              "mt-3.5 flex h-12 w-full items-center justify-center rounded-full",
              "bg-[#f1f2f4] text-[14px] font-semibold text-[#1a1d21]",
              "transition-colors hover:bg-[#e8eaed]",
              "dark:bg-muted dark:text-foreground",
            )}
          >
            创建账号
          </Link>
        </div>
      </div>

      <p className="mx-auto w-full max-w-[320px] shrink-0 pb-6 pt-2 text-center text-[11px] leading-relaxed text-[#9aa0a6]">
        登录即表示你同意我们的
        <br />
        <span className="font-semibold text-[var(--auth-accent)]">服务条款</span>
        {" 与 "}
        <span className="font-semibold text-[var(--auth-accent)]">隐私政策</span>
      </p>
    </div>
  )
}
