import { FormEvent, useState } from "react"
import { Link, Navigate, useLocation } from "react-router-dom"
import { Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react"
import { useAlert } from "@/contexts/AlertContext"
import { useAuth } from "@/contexts/AuthContext"
import { AuthMobileField } from "@/components/auth-mobile-field"
import { cn } from "@/lib/utils"

const REMEMBER_KEY = "aurestream.auth.remember"

export default function LoginPage() {
  const { user, authLoading, login } = useAuth()
  const { showErrorFromUnknown, showInfo } = useAlert()
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
  const [successMessage] = useState(() => {
    const state = location.state as { message?: string } | null
    return state?.message ?? ""
  })

  if (user) {
    return <Navigate to="/" replace />
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    try {
      try {
        localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0")
      } catch {
        // ignore
      }
      await login(email.trim(), password)
    } catch (err) {
      showErrorFromUnknown(err, "登录失败", "登录失败")
    }
  }

  const handleForgot = () => {
    showInfo("忘记密码功能即将推出，敬请期待。")
  }

  return (
    <div className="relative flex h-full w-full flex-col overflow-y-auto no-scrollbar bg-white px-6 animate-fade-in dark:bg-background">
      <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center py-6">
        <div className="flex w-full max-w-[288px] flex-col">
          <h1 className="mb-5 text-center text-[1.45rem] font-bold tracking-tight text-[#1a1d21] dark:text-foreground">
            登录
          </h1>

          {successMessage ? (
            <div className="mb-3 rounded-xl border border-success/20 bg-success/10 px-3 py-2 text-xs font-medium text-success">
              {successMessage}
            </div>
          ) : null}

          <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-2.5">
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
                  className="shrink-0 rounded-full p-0.5 text-[#9aa0a6] transition-colors hover:text-[#1a1d21]"
                  aria-label={showPassword ? "隐藏密码" : "显示密码"}
                >
                  {showPassword ? (
                    <EyeOff className="size-4" strokeWidth={1.75} />
                  ) : (
                    <Eye className="size-4" strokeWidth={1.75} />
                  )}
                </button>
              }
            />

            <div className="flex items-center justify-between px-0.5 pt-0.5">
              <label className="flex cursor-pointer items-center gap-1.5 select-none">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="size-3.5 shrink-0 rounded border-[#cfd3d8] accent-[var(--auth-accent)]"
                />
                <span className="text-xs font-medium text-[#6b7280]">记住我</span>
              </label>
              <button
                type="button"
                onClick={handleForgot}
                className="text-xs font-semibold text-[var(--auth-accent)] transition-opacity hover:opacity-80"
              >
                忘记密码
              </button>
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className={cn(
                "mt-0.5 flex h-11 w-full items-center justify-center gap-2 rounded-full",
                "bg-[var(--auth-accent)] text-[13px] font-semibold text-white",
                "shadow-[0_6px_16px_rgba(108,92,255,0.2)]",
                "transition-all active:scale-[0.98]",
                "disabled:pointer-events-none disabled:opacity-60",
              )}
            >
              {authLoading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  请稍候...
                </>
              ) : (
                "继续"
              )}
            </button>
          </form>

          <div className="mt-5 flex items-center gap-2.5">
            <div className="h-px flex-1 bg-[#eceef1]" />
            <span className="text-[11px] font-medium text-[#9aa0a6]">还没有账号？</span>
            <div className="h-px flex-1 bg-[#eceef1]" />
          </div>

          <Link
            to="/register"
            className={cn(
              "mt-2.5 flex h-10 w-full items-center justify-center rounded-full",
              "bg-[#f1f2f4] text-[13px] font-semibold text-[#1a1d21]",
              "transition-colors hover:bg-[#e8eaed]",
              "dark:bg-muted dark:text-foreground",
            )}
          >
            创建账号
          </Link>
        </div>
      </div>

      <p className="mx-auto w-full max-w-[288px] shrink-0 pb-5 pt-1.5 text-center text-[10px] leading-relaxed text-[#9aa0a6]">
        登录即表示你同意我们的
        <br />
        <span className="font-semibold text-[var(--auth-accent)]">服务条款</span>
        {" 与 "}
        <span className="font-semibold text-[var(--auth-accent)]">隐私政策</span>
      </p>
    </div>
  )
}
