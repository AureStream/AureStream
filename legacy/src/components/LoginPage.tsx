import { useState } from "react"
import { Link, useLocation } from "react-router-dom"
import { Eye, EyeOff, Loader2, Lock, Mail, Shield } from "lucide-react"
import { useAuth } from "../contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { AuthMobileField } from "@/components/auth-mobile-field"

export default function LoginPage() {
  const { login } = useAuth()
  const location = useLocation()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
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
      await login(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败")
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
                <Shield className="relative size-8 text-white rotate-[6deg]" strokeWidth={2.2} />
              </div>
            </div>
            <h1 className="text-[1.75rem] font-black leading-tight tracking-tight text-foreground">
              欢迎使用 AureStream
            </h1>
            <p className="mt-2 max-w-[16rem] text-sm font-semibold leading-relaxed text-primary">
              安全、快速、简洁的网络连接体验
            </p>
          </div>

          {/* Form */}
          <div className="w-full space-y-4">
            {error && (
              <div className="rounded-2xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
                {error}
              </div>
            )}
            {successMessage && (
              <div className="rounded-2xl border border-success/25 bg-success/10 px-4 py-3 text-sm font-medium text-success">
                {successMessage}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <AuthMobileField
                id="login-email"
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
                id="login-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="密码"
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
                  "登录"
                )}
              </Button>
            </form>
          </div>

          {/* Switch link stays under the core block */}
          <div className="mt-8 text-center text-sm font-medium text-muted-foreground">
            还没有账号？{" "}
            <Link
              to="/register"
              className="font-extrabold text-primary transition-colors hover:text-primary/80"
            >
              注册
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
