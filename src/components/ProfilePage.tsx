import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { getVersion } from "@tauri-apps/api/app"
import { useAlert } from "@/contexts/AlertContext"
import { useAuth } from "@/contexts/AuthContext"
import { useEngine } from "@/contexts/EngineContext"
import { useSubs } from "@/contexts/SubsContext"
import MobileTopBar, { topBarIconBtnClass } from "@/components/MobileTopBar"
import { formatAppVersionLabel } from "@/lib/app-version"
import { subsSync } from "@/lib/ipc"
import { cn } from "@/lib/utils"

const ONE_GB = 1024 * 1024 * 1024
const ONE_TB = 1024 * 1024 * 1024 * 1024

function formatDate(ts: number) {
  if (!ts || ts <= 0) return "永久有效"
  const d = new Date(ts * 1000)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}年${m}月${day}日`
}

function getDaysRemaining(ts: number): { text: string; urgent: boolean } | null {
  if (!ts || ts <= 0) return null
  const now = Math.floor(Date.now() / 1000)
  const diff = ts - now
  if (diff <= 0) return { text: "已到期", urgent: true }
  const days = Math.ceil(diff / (24 * 3600))
  if (days <= 7) return { text: `剩余 ${days} 天`, urgent: true }
  return { text: `剩余 ${days} 天`, urgent: false }
}

const Icons = {
  Refresh: ({ spinning }: { spinning?: boolean }) => (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={cn("transition-transform duration-700", spinning && "animate-spin")}
    >
      <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
    </svg>
  ),
  LogOut: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  Server: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect width="20" height="8" x="2" y="2" rx="2" ry="2" />
      <rect width="20" height="8" x="2" y="14" rx="2" ry="2" />
      <line x1="6" x2="6.01" y1="6" y2="6" />
      <line x1="6" x2="6.01" y1="18" y2="18" />
    </svg>
  ),
  Package: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m7.5 4.27 9 5.15" />
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  ),
  Info: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  ),
}

export default function ProfilePage() {
  const navigate = useNavigate()
  const { user, authLoading, logout } = useAuth()
  const { subscriptions, activeId, nodes, syncing } = useSubs()
  const { engine, stop } = useEngine()
  const { showErrorFromUnknown } = useAlert()
  const [appVersion, setAppVersion] = useState("v1.0.2")
  const [manualSyncing, setManualSyncing] = useState(false)

  useEffect(() => {
    let cancelled = false
    void getVersion().then(
      (v) => {
        if (!cancelled) setAppVersion(formatAppVersionLabel(v))
      },
      () => {},
    )
    return () => {
      cancelled = true
    }
  }, [])

  const emailUser = user?.email ?? "User"
  const displayName = emailUser.split("@")[0]

  const sub =
    (activeId && subscriptions.find((s) => s.id === activeId)) || subscriptions[0] || null
  const hasSub = Boolean(sub)
  const trafficTotal = hasSub && sub!.trafficTotal > 1 ? sub!.trafficTotal : ONE_TB
  const trafficUsed = hasSub ? sub!.trafficUsed : 0
  const remainingBytes = Math.max(0, trafficTotal - trafficUsed)

  const usedGB = hasSub ? (trafficUsed / ONE_GB).toFixed(2) : "0.00"
  const remainingGB = hasSub ? (remainingBytes / ONE_GB).toFixed(2) : "0.00"
  const totalGB = hasSub ? (trafficTotal / ONE_GB).toFixed(0) : "0"
  const remainingPercent =
    hasSub && trafficTotal > 0
      ? Math.min(100, Math.max(0, (remainingBytes / trafficTotal) * 100))
      : 0
  const expireDateText = hasSub ? formatDate(sub!.expireTime) : "--"
  const daysInfo = hasSub ? getDaysRemaining(sub!.expireTime) : null

  const handleManualSync = async () => {
    if (manualSyncing || syncing) return
    setManualSyncing(true)
    try {
      await subsSync()
    } catch (err) {
      showErrorFromUnknown(err, "同步订阅失败", "同步错误")
    } finally {
      setManualSyncing(false)
    }
  }

  const handleLogout = async () => {
    try {
      if (engine.state === "running" || engine.state === "starting") {
        await stop()
      }
      await logout()
      navigate("/login", { replace: true })
    } catch (err) {
      showErrorFromUnknown(err, "退出登录失败", "退出失败")
    }
  }

  const isSyncBusy = manualSyncing || syncing

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-[#fafbfc] animate-fade-in dark:bg-background">
      <MobileTopBar
        onBack={() => navigate("/")}
        title="个人中心"
        right={
          <button
            type="button"
            onClick={() => void handleManualSync()}
            disabled={isSyncBusy}
            className={topBarIconBtnClass}
            aria-label="同步订阅"
            title="同步订阅"
          >
            <Icons.Refresh spinning={isSyncBusy} />
          </button>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col justify-between overflow-y-auto px-5 pb-5 pt-1">
        <div className="flex flex-col gap-3.5">
          {/* User Account Header Card */}
          <section className="flex items-center gap-3.5 rounded-[1.25rem] border border-[#eceef1] bg-white p-4 shadow-[0_2px_8px_rgba(15,23,42,0.03)] dark:border-border dark:bg-card">
            <div className="relative h-13 w-13 shrink-0 overflow-hidden rounded-full border border-white/80 bg-[#f1f2f4] shadow-sm dark:border-border dark:bg-muted">
              <img src="/avatar.svg" alt="" className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-[1.1rem] font-bold tracking-tight text-[#1a1d21] dark:text-foreground">
                  {displayName}
                </h2>
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    hasSub
                      ? "bg-[var(--auth-accent)]/10 text-[var(--auth-accent)]"
                      : "bg-[#8b93a0]/10 text-[#8b93a0]",
                  )}
                >
                  {hasSub ? "订阅有效" : "未激活订阅"}
                </span>
              </div>
              <p className="mt-0.5 truncate text-[13px] font-medium text-[#8b93a0]">{emailUser}</p>
            </div>
          </section>

          {/* Plan & Traffic Card */}
          <section className="relative overflow-hidden rounded-[1.25rem] border border-[#eceef1] bg-gradient-to-b from-white to-[#f6f7fa] p-4.5 shadow-[0_4px_16px_rgba(15,23,42,0.03)] dark:border-border dark:from-card dark:to-muted/60">
            {/* Soft decorative glow */}
            <div
              aria-hidden
              className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-[var(--auth-accent)]/10 blur-xl"
            />

            {/* Plan title & status pill */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-[var(--auth-accent)] animate-pulse" />
                <span className="text-[13px] font-bold tracking-tight text-[#1a1d21] dark:text-foreground">
                  {sub?.name || "当前套餐"}
                </span>
              </div>
              {daysInfo ? (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    daysInfo.urgent
                      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                  )}
                >
                  {daysInfo.text}
                </span>
              ) : null}
            </div>

            {/* Traffic metrics row */}
            <div className="mt-4 grid grid-cols-3 gap-2 divide-x divide-[#f1f2f4] dark:divide-border/60 text-center">
              <div className="px-1">
                <div className="text-[11px] font-medium text-[#8b93a0]">已用流量</div>
                <div className="mt-1 flex items-baseline justify-center gap-0.5">
                  <span className="text-[1.25rem] font-bold tabular-nums text-[#1a1d21] dark:text-foreground">
                    {usedGB}
                  </span>
                  <span className="text-[10px] font-semibold text-[#8b93a0]">GB</span>
                </div>
              </div>
              <div className="px-1">
                <div className="text-[11px] font-medium text-[#8b93a0]">剩余流量</div>
                <div className="mt-1 flex items-baseline justify-center gap-0.5">
                  <span className="text-[1.25rem] font-bold tabular-nums text-[var(--auth-accent)]">
                    {remainingGB}
                  </span>
                  <span className="text-[10px] font-semibold text-[#8b93a0]">GB</span>
                </div>
              </div>
              <div className="px-1">
                <div className="text-[11px] font-medium text-[#8b93a0]">总额度</div>
                <div className="mt-1 flex items-baseline justify-center gap-0.5">
                  <span className="text-[1.25rem] font-bold tabular-nums text-[#1a1d21] dark:text-foreground">
                    {totalGB}
                  </span>
                  <span className="text-[10px] font-semibold text-[#8b93a0]">GB</span>
                </div>
              </div>
            </div>

            {/* Remaining progress bar */}
            <div className="mt-4.5">
              <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-[#8b93a0]">
                <span>流量使用情况</span>
                <span className="font-semibold text-[var(--auth-accent)] tabular-nums">
                  剩余 {hasSub ? `${remainingPercent.toFixed(0)}%` : "--"}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[#e8eaef] dark:bg-background/60">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#b8aeff] via-[var(--auth-accent)] to-[#4f3fe0] transition-all duration-500"
                  style={{ width: `${hasSub ? remainingPercent : 0}%` }}
                />
              </div>
              <div className="mt-2 text-right text-[11px] font-medium text-[#8b93a0]">
                到期时间：{expireDateText}
              </div>
            </div>
          </section>

          {/* Details & Information Card */}
          <section className="relative overflow-hidden rounded-[1.25rem] border border-[#eceef1] bg-gradient-to-b from-white to-[#f6f7fa] p-4.5 shadow-[0_4px_16px_rgba(15,23,42,0.03)] dark:border-border dark:from-card dark:to-muted/60">
            {/* Soft decorative glow */}
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-6 -left-6 h-28 w-28 rounded-full bg-[var(--auth-accent)]/8 blur-xl"
            />

            {/* Header row */}
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-[var(--auth-accent)]" />
                <span className="text-[13px] font-bold tracking-tight text-[#1a1d21] dark:text-foreground">
                  服务详情
                </span>
              </div>
              <span className="rounded-full bg-[var(--auth-accent)]/10 px-2 py-0.5 text-[11px] font-semibold text-[var(--auth-accent)]">
                {hasSub ? "正常运行" : "暂未连接"}
              </span>
            </div>

            {/* Details list */}
            <div className="flex flex-col divide-y divide-[#f1f2f4] dark:divide-border/60">
              <div className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-2.5 text-[#1a1d21] dark:text-foreground">
                  <span className="text-[#8b93a0]">
                    <Icons.Package />
                  </span>
                  <span className="text-[13px] font-medium">订阅套餐</span>
                </div>
                <span className="text-[12px] font-semibold text-[#1a1d21] dark:text-foreground truncate max-w-[50%]">
                  {sub?.name || "未绑定"}
                </span>
              </div>

              <div className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-2.5 text-[#1a1d21] dark:text-foreground">
                  <span className="text-[#8b93a0]">
                    <Icons.Server />
                  </span>
                  <span className="text-[13px] font-medium">可用节点</span>
                </div>
                <span className="text-[12px] font-semibold text-[#1a1d21] dark:text-foreground">
                  {nodes.length > 0 ? `${nodes.length} 个节点` : "暂无节点"}
                </span>
              </div>

              <div className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-2.5 text-[#1a1d21] dark:text-foreground">
                  <span className="text-[#8b93a0]">
                    <Icons.Info />
                  </span>
                  <span className="text-[13px] font-medium">客户端版本</span>
                </div>
                <span className="text-[12px] font-semibold text-[#1a1d21] dark:text-foreground">
                  {appVersion}
                </span>
              </div>
            </div>
          </section>
        </div>

        {/* Bottom Single Logout Button */}
        <div className="mx-auto mt-4 w-full max-w-[340px] pt-1">
          <button
            type="button"
            onClick={() => void handleLogout()}
            disabled={authLoading}
            className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-[#fce8e8] text-[14px] font-bold text-[#e11d48] transition-all hover:bg-[#fbd5d5] active:scale-[0.98] disabled:opacity-60 dark:bg-rose-950/40 dark:text-rose-400 dark:hover:bg-rose-950/60"
          >
            <Icons.LogOut />
            <span>{authLoading ? "退出中…" : "退出当前账号"}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
