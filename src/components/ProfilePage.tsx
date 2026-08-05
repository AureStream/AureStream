import { useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { useSubs } from "@/contexts/SubsContext"
import MobileTopBar, { topBarIconBtnClass } from "@/components/MobileTopBar"

const ONE_GB = 1024 * 1024 * 1024
const ONE_TB = 1024 * 1024 * 1024 * 1024

function formatDate(ts: number) {
  if (!ts || ts <= 0) return "--"
  const d = new Date(ts * 1000)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}年${m}月${day}日`
}

const I = {
  LogOut: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
}

export default function ProfilePage() {
  const navigate = useNavigate()
  const { user, authLoading, logout } = useAuth()
  const { subscriptions, activeId, syncing } = useSubs()

  const emailUser = user?.email ?? "User"
  const displayName = emailUser.split("@")[0]

  const sub =
    (activeId && subscriptions.find((s) => s.id === activeId)) || subscriptions[0] || null
  const hasSub = Boolean(sub)
  const trafficTotal = hasSub && sub!.trafficTotal > 1 ? sub!.trafficTotal : ONE_TB
  const isFallback = !hasSub || sub!.trafficTotal <= 1
  const trafficUsed = hasSub ? sub!.trafficUsed : 0
  const remainingBytes = Math.max(0, trafficTotal - trafficUsed)

  const remainingGBValue = !hasSub
    ? "--"
    : remainingBytes >= ONE_TB
      ? (remainingBytes / ONE_TB).toFixed(1)
      : (remainingBytes / ONE_GB).toFixed(1)
  const remainingUnitLabel = !hasSub ? "" : remainingBytes >= ONE_TB ? "TB" : "GB"
  const usedGB = hasSub ? (trafficUsed / ONE_GB).toFixed(1) : "0.0"
  const totalDisplay = isFallback
    ? "1 TB"
    : `${(sub!.trafficTotal / ONE_GB).toFixed(0)} GB`
  const remainingPercent =
    trafficTotal > 0
      ? Math.max(0, Math.min(100, Math.round((remainingBytes / trafficTotal) * 100)))
      : 0
  const expireText = hasSub ? formatDate(sub!.expireTime) : "--"

  const r = 42
  const c = 2 * Math.PI * r
  const dashOffset = c * (1 - remainingPercent / 100)

  const handleLogout = async () => {
    await logout()
    navigate("/login", { replace: true })
  }

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-white animate-fade-in dark:bg-background">
      <MobileTopBar
        onBack={() => navigate("/")}
        title="我的"
        right={
          <button
            type="button"
            onClick={() => void handleLogout()}
            disabled={authLoading}
            className={topBarIconBtnClass}
            aria-label="退出登录"
            title="退出登录"
          >
            <I.LogOut />
          </button>
        }
      />

      <div className="relative flex min-h-0 w-full flex-1 flex-col gap-4 overflow-y-auto no-scrollbar px-5 pb-6 pt-2">
        <section className="flex min-h-[5.5rem] shrink-0 items-center gap-4 px-1 pb-2">
          <div className="h-[4.25rem] w-[4.25rem] shrink-0 overflow-hidden rounded-full border border-[#eceef1] bg-[#f1f2f4] shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-border dark:bg-muted">
            <img src="/avatar.svg" alt="" className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[1.4rem] font-bold leading-none tracking-tight text-[#1a1d21] dark:text-foreground">
              {displayName}
            </h2>
            <p className="mt-1.5 truncate text-[0.95rem] font-medium text-[#6b7280]">{emailUser}</p>
            {syncing ? (
              <p className="mt-1 text-xs font-medium text-[#9aa0a6]">订阅同步中…</p>
            ) : null}
          </div>
        </section>

        <section className="flex min-h-0 flex-1 flex-col items-stretch justify-center gap-8 rounded-[1.25rem] bg-[#f1f2f4] px-5 pb-7 pt-11 dark:bg-muted">
          <div className="grid grid-cols-2 place-items-center gap-4">
            <div className="relative h-[10.25rem] w-[10.25rem] justify-self-center">
              <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
                <circle cx="50" cy="50" r={r} fill="none" stroke="#e5e7eb" strokeWidth="5" />
                <circle
                  cx="50"
                  cy="50"
                  r={r}
                  fill="none"
                  stroke="var(--auth-accent)"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={c}
                  strokeDashoffset={dashOffset}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center px-2 text-center">
                <div className="text-[1.45rem] font-bold leading-none tabular-nums text-[#1a1d21] dark:text-foreground">
                  {remainingGBValue}
                  {remainingUnitLabel ? (
                    <span className="ml-0.5 text-[0.85rem] font-semibold text-[#6b7280]">
                      {remainingUnitLabel}
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 text-sm font-semibold leading-tight text-[#9aa0a6]">
                  套餐剩余流量
                </div>
              </div>
            </div>

            <div className="flex w-full max-w-[9rem] min-w-0 flex-col items-center justify-self-center gap-5 text-center">
              <div className="flex items-start justify-center gap-2">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#c5ccd6]" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[#9aa0a6]">套餐已使用流量</div>
                  <div className="mt-1 text-[1.25rem] font-bold leading-none tabular-nums text-[#1a1d21] dark:text-foreground">
                    {usedGB}
                    <span className="ml-0.5 text-xs font-semibold text-[#9aa0a6]">GB</span>
                  </div>
                </div>
              </div>
              <div className="flex items-start justify-center gap-2">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--auth-accent)]" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[#9aa0a6]">套餐总流量</div>
                  <div className="mt-1 text-[1.25rem] font-bold leading-none tabular-nums text-[#1a1d21] dark:text-foreground">
                    {totalDisplay}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="text-center">
            <div className="text-sm font-semibold leading-tight text-[#9aa0a6]">套餐结束时间</div>
            <div className="mt-1 text-[1rem] font-bold leading-tight text-[#1a1d21] dark:text-foreground">
              {expireText}
            </div>
          </div>
        </section>

        <button
          type="button"
          onClick={() => void handleLogout()}
          disabled={authLoading}
          className="h-11 w-full shrink-0 cursor-pointer rounded-full bg-[#f1f2f4] text-base font-bold text-[#1a1d21] transition-all hover:bg-[#e8eaed] active:scale-[0.98] disabled:opacity-60 dark:bg-muted dark:text-foreground"
        >
          {authLoading ? "退出中…" : "退出登录"}
        </button>
      </div>
    </div>
  )
}
