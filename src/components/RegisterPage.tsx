import { FormEvent, useEffect, useState } from "react"
import { Link, Navigate } from "react-router-dom"
import { Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { AuthError } from "@/lib/auth-errors"
import { AuthMobileField } from "@/components/auth-mobile-field"
import { cn } from "@/lib/utils"

const DEFAULT_RESEND_COOLDOWN = 60

const primaryBtnClass = cn(
  "mt-1 flex h-[3.25rem] w-full items-center justify-center gap-2 rounded-full",
  "bg-[var(--auth-accent)] text-[15px] font-semibold text-white",
  "shadow-[0_8px_20px_rgba(108,92,255,0.22)]",
  "transition-all active:scale-[0.98]",
  "disabled:pointer-events-none disabled:opacity-60",
)

export default function RegisterPage() {
  const { user, authLoading, register, verifyAndLogin } = useAuth()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [code, setCode] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState("")
  const [info, setInfo] = useState("")
  const [codeSent, setCodeSent] = useState(false)
  const [resendIn, setResendIn] = useState(0)
  const [sendingCode, setSendingCode] = useState(false)

  useEffect(() => {
    if (resendIn <= 0) return
    const id = window.setTimeout(() => setResendIn((s) => s - 1), 1000)
    return () => window.clearTimeout(id)
  }, [resendIn])

  if (user) {
    return <Navigate to="/" replace />
  }

  const startResendCooldown = (seconds: number = DEFAULT_RESEND_COOLDOWN) => {
    setResendIn(Math.max(0, Math.ceil(seconds)))
  }

  const validateCredentials = (): string | null => {
    const trimmed = email.trim()
    if (!trimmed) return "请输入邮箱地址"
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return "邮箱格式不正确"
    if (password.length < 6) return "密码至少 6 位"
    if (password !== confirmPassword) return "两次输入的密码不一致"
    return null
  }

  const handleSendCode = async () => {
    if (sendingCode || authLoading || resendIn > 0) return
    setError("")
    setInfo("")

    const validationError = validateCredentials()
    if (validationError) {
      setError(validationError)
      return
    }

    setSendingCode(true)
    try {
      const pending = await register(email.trim(), password)
      setCodeSent(true)
      setInfo(`验证码已发送至 ${pending.email}，${pending.expires_in} 秒内有效`)
      startResendCooldown(DEFAULT_RESEND_COOLDOWN)
      setCode("")
    } catch (err) {
      if (err instanceof AuthError && err.code === "resend_too_soon") {
        startResendCooldown(err.retryAfter ?? DEFAULT_RESEND_COOLDOWN)
      }
      setError(err instanceof AuthError ? err.message : "验证码发送失败")
    } finally {
      setSendingCode(false)
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError("")
    setInfo("")

    const validationError = validateCredentials()
    if (validationError) {
      setError(validationError)
      return
    }

    if (!codeSent) {
      setError("请先获取邮箱验证码")
      return
    }

    const normalized = code.replace(/\s/g, "")
    if (!/^\d{6}$/.test(normalized)) {
      setError("请输入 6 位数字验证码")
      return
    }

    try {
      await verifyAndLogin(email.trim(), password, normalized)
    } catch (err) {
      setError(err instanceof AuthError ? err.message : "验证失败")
    }
  }

  const sendCodeLabel = sendingCode
    ? "发送中..."
    : resendIn > 0
      ? `${resendIn}s`
      : codeSent
        ? "重新发送"
        : "获取验证码"

  return (
    <div className="relative flex h-full w-full flex-col overflow-y-auto no-scrollbar bg-white px-8 animate-fade-in dark:bg-background">
      <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center py-8">
        <div className="flex w-full max-w-[320px] flex-col">
          <h1 className="mb-7 text-center text-[1.75rem] font-bold tracking-tight text-[#1a1d21] dark:text-foreground">
            注册
          </h1>

          {error ? (
            <div className="mb-4 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-2.5 text-sm font-medium text-destructive">
              {error}
            </div>
          ) : null}
          {info && !error ? (
            <div className="mb-4 rounded-2xl border border-success/20 bg-success/10 px-4 py-2.5 text-sm font-medium text-success">
              {info}
            </div>
          ) : null}

          <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-3.5">
            <AuthMobileField
              id="register-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (codeSent) {
                  setCodeSent(false)
                  setCode("")
                  setInfo("")
                }
              }}
              placeholder="邮箱地址"
              required
              aria-label="邮箱地址"
              icon={<Mail strokeWidth={1.75} />}
            />

            <AuthMobileField
              id="register-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="密码（至少 6 位）"
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

            <AuthMobileField
              id="register-confirm"
              type={showConfirmPassword ? "text" : "password"}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="确认密码"
              required
              aria-label="确认密码"
              icon={<Lock strokeWidth={1.75} />}
              trailing={
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="shrink-0 rounded-full p-1 text-[#9aa0a6] transition-colors hover:text-[#1a1d21]"
                  aria-label={showConfirmPassword ? "隐藏密码" : "显示密码"}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="size-[18px]" strokeWidth={1.75} />
                  ) : (
                    <Eye className="size-[18px]" strokeWidth={1.75} />
                  )}
                </button>
              }
            />

            <AuthMobileField
              id="register-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="6 位邮箱验证码"
              required
              aria-label="邮箱验证码"
              icon={<ShieldCheck strokeWidth={1.75} />}
              trailing={
                <button
                  type="button"
                  disabled={sendingCode || authLoading || resendIn > 0}
                  onClick={() => void handleSendCode()}
                  className={cn(
                    "shrink-0 whitespace-nowrap rounded-full px-2 py-1 text-[13px] font-semibold",
                    "text-[var(--auth-accent)] transition-opacity",
                    "disabled:cursor-not-allowed disabled:text-[#9aa0a6] disabled:opacity-80",
                  )}
                >
                  {sendCodeLabel}
                </button>
              }
            />

            <button type="submit" disabled={authLoading || sendingCode} className={primaryBtnClass}>
              {authLoading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  注册中...
                </>
              ) : (
                "注册"
              )}
            </button>
          </form>

          <div className="mt-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-[#eceef1]" />
            <span className="text-[12px] font-medium text-[#9aa0a6]">已有账号？</span>
            <div className="h-px flex-1 bg-[#eceef1]" />
          </div>

          <Link
            to="/login"
            className={cn(
              "mt-3.5 flex h-12 w-full items-center justify-center rounded-full",
              "bg-[#f1f2f4] text-[14px] font-semibold text-[#1a1d21]",
              "transition-colors hover:bg-[#e8eaed]",
              "dark:bg-muted dark:text-foreground",
            )}
          >
            去登录
          </Link>
        </div>
      </div>

      <p className="mx-auto w-full max-w-[320px] shrink-0 pb-6 pt-2 text-center text-[11px] leading-relaxed text-[#9aa0a6]">
        注册即表示你同意我们的
        <br />
        <span className="font-semibold text-[var(--auth-accent)]">服务条款</span>
        {" 与 "}
        <span className="font-semibold text-[var(--auth-accent)]">隐私政策</span>
      </p>
    </div>
  )
}
