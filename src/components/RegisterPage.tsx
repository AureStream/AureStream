import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck, UserPlus } from "lucide-react"
import { AuthApiError } from "../api/auth"
import { useAuth } from "../contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { AuthMobileField } from "@/components/auth-mobile-field"

type Step = "credentials" | "verify"

const DEFAULT_RESEND_COOLDOWN = 60

export default function RegisterPage() {
  const { register, verifyAndLogin } = useAuth()

  const [step, setStep] = useState<Step>("credentials")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [code, setCode] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState("")
  const [info, setInfo] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [resendIn, setResendIn] = useState(0)

  useEffect(() => {
    if (resendIn <= 0) return
    const id = window.setTimeout(() => setResendIn((s) => s - 1), 1000)
    return () => window.clearTimeout(id)
  }, [resendIn])

  const startResendCooldown = (seconds: number = DEFAULT_RESEND_COOLDOWN) => {
    setResendIn(Math.max(0, Math.ceil(seconds)))
  }

  const sendCode = async () => {
    const pending = await register(email.trim(), password)
    setInfo(`验证码已发送至 ${pending.email}，${pending.expires_in} 秒内有效`)
    startResendCooldown(DEFAULT_RESEND_COOLDOWN)
    setStep("verify")
  }

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setInfo("")
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
      await sendCode()
    } catch (err) {
      if (err instanceof AuthApiError && err.code === "resend_too_soon") {
        startResendCooldown(err.retryAfter ?? DEFAULT_RESEND_COOLDOWN)
      }
      setError(err instanceof Error ? err.message : "注册失败")
    } finally {
      setSubmitting(false)
    }
  }

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    const normalized = code.replace(/\s/g, "")
    if (!/^\d{6}$/.test(normalized)) {
      setError("请输入 6 位数字验证码")
      return
    }
    setSubmitting(true)
    try {
      await verifyAndLogin(email.trim(), password, normalized)
      // PublicOnly redirects to /dashboard once user is set.
    } catch (err) {
      setError(err instanceof Error ? err.message : "验证失败")
    } finally {
      setSubmitting(false)
    }
  }

  const handleResend = async () => {
    if (resendIn > 0 || submitting) return
    setError("")
    setInfo("")
    setSubmitting(true)
    try {
      await sendCode()
    } catch (err) {
      if (err instanceof AuthApiError && err.code === "resend_too_soon") {
        startResendCooldown(err.retryAfter ?? DEFAULT_RESEND_COOLDOWN)
      }
      setError(err instanceof Error ? err.message : "重发失败")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex h-full w-full flex-col px-8 py-10 animate-fade-in">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
        <div className="flex w-full max-w-[340px] flex-col items-center">
          <div className="mb-16 flex flex-col items-center text-center">
            <div className="relative mb-5 flex h-[4.5rem] w-[4.5rem] items-center justify-center">
              <div className="absolute inset-0 rounded-[1.5rem] bg-primary/20 blur-xl" />
              <div className="relative flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-[1.4rem] bg-gradient-to-br from-primary via-[#7C6CFF] to-[#A898FF] shadow-lg shadow-primary/30 rotate-[-6deg]">
                <div className="absolute inset-[3px] rounded-[1.2rem] bg-white/10" />
                {step === "verify" ? (
                  <ShieldCheck className="relative size-8 text-white rotate-[6deg]" strokeWidth={2.2} />
                ) : (
                  <UserPlus className="relative size-8 text-white rotate-[6deg]" strokeWidth={2.2} />
                )}
              </div>
            </div>
            <h1 className="text-[1.75rem] font-black leading-tight tracking-tight text-foreground">
              {step === "verify" ? "验证邮箱" : "创建账号"}
            </h1>
            <p className="mt-2 max-w-[16rem] text-sm font-semibold leading-relaxed text-primary">
              {step === "verify"
                ? `验证码已发送到 ${email.trim()}`
                : "几步完成注册，开启安全连接"}
            </p>
          </div>

          <div className="w-full space-y-4">
            {error && (
              <div className="rounded-2xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
                {error}
              </div>
            )}
            {info && !error && (
              <div className="rounded-2xl border border-success/25 bg-success/10 px-4 py-3 text-sm font-medium text-success">
                {info}
              </div>
            )}

            {step === "credentials" ? (
              <form onSubmit={handleCredentialsSubmit} className="flex flex-col gap-5">
                <AuthMobileField
                  id="register-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="邮箱"
                  required
                  aria-label="邮箱"
                  icon={<Mail />}
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
                  icon={<Lock />}
                  trailing={
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                      aria-label={showPassword ? "隐藏密码" : "显示密码"}
                    >
                      {showPassword ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
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
                  icon={<Lock />}
                  trailing={
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                      aria-label={showConfirmPassword ? "隐藏密码" : "显示密码"}
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="size-[18px]" />
                      ) : (
                        <Eye className="size-[18px]" />
                      )}
                    </button>
                  }
                />

                <Button
                  type="submit"
                  size="xl"
                  disabled={submitting}
                  className="mt-2 h-14 w-full rounded-full text-base font-extrabold shadow-md shadow-primary/25 active:scale-[0.98]"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      发送验证码...
                    </>
                  ) : (
                    "获取验证码"
                  )}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleVerifySubmit} className="flex flex-col gap-5">
                <AuthMobileField
                  id="register-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="6 位验证码"
                  required
                  aria-label="验证码"
                  icon={<ShieldCheck />}
                />

                <Button
                  type="submit"
                  size="xl"
                  disabled={submitting || code.length !== 6}
                  className="mt-2 h-14 w-full rounded-full text-base font-extrabold shadow-md shadow-primary/25 active:scale-[0.98]"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      验证并登录...
                    </>
                  ) : (
                    "验证并登录"
                  )}
                </Button>

                <div className="flex items-center justify-between text-sm font-medium">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => {
                      setStep("credentials")
                      setCode("")
                      setError("")
                      setInfo("")
                    }}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    返回修改
                  </button>
                  <button
                    type="button"
                    disabled={submitting || resendIn > 0}
                    onClick={() => void handleResend()}
                    className="font-extrabold text-primary transition-colors hover:text-primary/80 disabled:text-muted-foreground"
                  >
                    {resendIn > 0 ? `${resendIn}s 后可重发` : "重新发送"}
                  </button>
                </div>
              </form>
            )}
          </div>

          <div className="mt-8 text-center text-sm font-medium text-muted-foreground">
            已有账号？{" "}
            <Link
              to="/login"
              className="font-extrabold text-primary transition-colors hover:text-primary/80"
            >
              登录
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
