import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Eye, EyeOff, Loader2, Lock, Mail, UserPlus } from "lucide-react"
import { useAuth } from "../contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { AuthMobileField } from "@/components/auth-mobile-field"

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
    <div className="relative flex h-full w-full flex-col px-8 py-10 animate-fade-in">
      {/* Brand + form move together as one core block */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
        <div className="flex w-full max-w-[340px] flex-col items-center">
          {/* Brand — attached above the form */}
          <div className="mb-16 flex flex-col items-center text-center">
            <div className="relative mb-5 flex h-[4.5rem] w-[4.5rem] items-center justify-center">
              <div className="absolute inset-0 rounded-[1.5rem] bg-primary/20 blur-xl" />
              <div className="relative flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-[1.4rem] bg-gradient-to-br from-primary via-[#7C6CFF] to-[#A898FF] shadow-lg shadow-primary/30 rotate-[-6deg]">
                <div className="absolute inset-[3px] rounded-[1.2rem] bg-white/10" />
                <UserPlus className="relative size-8 text-white rotate-[6deg]" strokeWidth={2.2} />
              </div>
            </div>
            <h1 className="text-[1.75rem] font-black leading-tight tracking-tight text-foreground">
              创建账号
            </h1>
            <p className="mt-2 max-w-[16rem] text-sm font-semibold leading-relaxed text-primary">
              几步完成注册，开启安全连接
            </p>
          </div>

          {/* Form */}
          <div className="w-full space-y-4">
            {error && (
              <div className="rounded-2xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
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
                    请稍候...
                  </>
                ) : (
                  "注册"
                )}
              </Button>
            </form>
          </div>

          {/* Switch link stays under the core block */}
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
