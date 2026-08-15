import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAlert } from "@/contexts/AlertContext"
import { useAuth } from "@/contexts/AuthContext"
import { useEngine } from "@/contexts/EngineContext"
import { useSubs } from "@/contexts/SubsContext"
import MobileTopBar, { topBarIconBtnClass } from "@/components/MobileTopBar"
import { engineProbeTun, engineUninstallHelper } from "@/lib/ipc"

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
  const { engine, stop } = useEngine()
  const { showConfirm, showErrorFromUnknown, showInfo } = useAlert()
  const [tunHelperReady, setTunHelperReady] = useState(false)
  const [uninstallingHelper, setUninstallingHelper] = useState(false)

  const refreshTunHelper = useCallback(async () => {
    try {
      const s = await engineProbeTun()
      setTunHelperReady(s === "ready" || s === "running")
    } catch {
      setTunHelperReady(false)
    }
  }, [])

  useEffect(() => {
    void refreshTunHelper()
  }, [refreshTunHelper])

  const handleUninstallHelper = async () => {
    const ok = await showConfirm({
      title: "卸载虚拟网卡组件",
      message:
        "将卸载虚拟网卡特权组件：\n• macOS：SMJobBless Helper\n• Windows：TUN 系统服务\n• Linux：pkexec Helper + polkit\n\n卸载后需重新开启虚拟网卡才会再次安装。",
      kind: "error",
      confirmLabel: "确认卸载",
    })
    if (!ok) return
    setUninstallingHelper(true)
    try {
      await engineUninstallHelper()
      setTunHelperReady(false)
      showInfo(
        "虚拟网卡组件已卸载。删除本应用前建议先执行此操作；若直接删除应用，各平台也会在后台自动清理残留组件。",
        "卸载完成",
      )
      void refreshTunHelper()
    } catch (err) {
      showErrorFromUnknown(err, "卸载虚拟网卡组件失败", "卸载失败")
    } finally {
      setUninstallingHelper(false)
    }
  }

  const emailUser = user?.email ?? "User"
  const displayName = emailUser.split("@")[0]

  const sub =
    (activeId && subscriptions.find((s) => s.id === activeId)) || subscriptions[0] || null
  const hasSub = Boolean(sub)
  const trafficTotal = hasSub && sub!.trafficTotal > 1 ? sub!.trafficTotal : ONE_TB
  const trafficUsed = hasSub ? sub!.trafficUsed : 0
  const remainingBytes = Math.max(0, trafficTotal - trafficUsed)

  const usedGB = hasSub ? (trafficUsed / ONE_GB).toFixed(2) : "--"
  const remainingGB = hasSub ? (remainingBytes / ONE_GB).toFixed(2) : "--"
  const remainingPercent =
    hasSub && trafficTotal > 0
      ? Math.min(100, (remainingBytes / trafficTotal) * 100)
      : 0
  const expireText = hasSub ? formatDate(sub!.expireTime) : "--"

  const handleLogout = async () => {
    try {
      // Tear down the tunnel first — otherwise it keeps running across the
      // session boundary, and its "connected" state blocks the subscription
      // sync that should fire on the next login (see SubsContext's engine gate).
      if (engine.state === "running" || engine.state === "starting") {
        await stop()
      }
      await logout()
      navigate("/login", { replace: true })
    } catch (err) {
      showErrorFromUnknown(err, "退出登录失败", "退出失败")
    }
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-white animate-fade-in dark:bg-background">
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

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 pb-3 pt-0">
        {/* User header — compact card, same radius as home traffic card */}
        <section className="flex shrink-0 items-center gap-3.5 rounded-[1.15rem] bg-[#f1f2f4] px-4 py-3.5 dark:bg-muted">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full border border-white/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-border dark:bg-card">
            <img src="/avatar.svg" alt="" className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[1.25rem] font-bold leading-none tracking-tight text-[#1a1d21] dark:text-foreground">
              {displayName}
            </h2>
            <p className="mt-1.5 truncate text-sm font-medium text-[#6b7280]">{emailUser}</p>
            {syncing ? (
              <p className="mt-1 text-[11px] font-medium text-[#9aa0a6]">订阅同步中…</p>
            ) : null}
          </div>
        </section>

        {/* Traffic summary — polished card */}
        <section className="relative mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.25rem] border border-[#eceef1] bg-gradient-to-b from-white to-[#f4f5f8] px-4 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] dark:border-border dark:from-card dark:to-muted">
          {/* soft accent glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-[var(--auth-accent)]/10 blur-2xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-12 -left-10 h-32 w-32 rounded-full bg-[var(--auth-accent)]/5 blur-2xl"
          />

          <div className="relative flex shrink-0 items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-[var(--auth-accent)]/10 px-2.5 py-1">
                <span className="size-1.5 rounded-full bg-[var(--auth-accent)]" />
                <span className="text-[11px] font-semibold text-[var(--auth-accent)]">本月流量</span>
              </div>
              <p className="mt-2.5 text-xs font-medium text-[#6b7280]">使用流量</p>
              <div className="mt-0.5 flex items-baseline gap-1">
                <span className="text-[1.75rem] font-bold tracking-tight text-[#1a1d21] tabular-nums dark:text-foreground">
                  {usedGB}
                </span>
                <span className="text-sm font-semibold text-[#9aa0a6]">GB</span>
              </div>
              <p className="mt-1.5 text-[11px] font-medium leading-snug text-[#9aa0a6]">
                到期 {expireText}
              </p>
            </div>

            <div className="relative h-[5.25rem] w-[8rem] shrink-0">
              <svg className="h-full w-full overflow-visible" viewBox="0 0 120 78" aria-hidden>
                <defs>
                  <linearGradient id="profileTrafficGauge" x1="12" y1="66" x2="108" y2="14" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#c4bbff" />
                    <stop offset="50%" stopColor="#6c5cff" />
                    <stop offset="100%" stopColor="#4f3fe0" />
                  </linearGradient>
                  <filter id="profileGaugeGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="0" stdDeviation="1.6" floodColor="#6c5cff" floodOpacity="0.35" />
                  </filter>
                </defs>
                <path
                  d="M 14 64 A 46 46 0 0 1 106 64"
                  fill="none"
                  stroke="#e8eaef"
                  strokeWidth="7"
                  strokeLinecap="round"
                />
                <path
                  d="M 14 64 A 46 46 0 0 1 106 64"
                  fill="none"
                  stroke="url(#profileTrafficGauge)"
                  strokeWidth="7"
                  strokeLinecap="round"
                  pathLength="100"
                  strokeDasharray="100"
                  strokeDashoffset={100 - remainingPercent}
                  filter="url(#profileGaugeGlow)"
                />
              </svg>
              <div className="pointer-events-none absolute inset-x-[12%] bottom-[6px] flex flex-col items-center">
                <span className="text-[10px] font-semibold leading-none text-[#6b7280]">
                  剩余流量
                </span>
                <div className="mt-1 flex items-baseline gap-0.5 leading-none">
                  <span className="text-[15px] font-bold tabular-nums text-[#1a1d21] dark:text-foreground">
                    {remainingGB}
                  </span>
                  <span className="text-[10px] font-semibold text-[#9aa0a6]">GB</span>
                </div>
              </div>
            </div>
          </div>

          {/* Remaining progress bar */}
          <div className="relative mt-5 shrink-0">
            <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium">
              <span className="text-[#9aa0a6]">剩余占比</span>
              <span className="font-semibold tabular-nums text-[var(--auth-accent)]">
                {hasSub ? `${remainingPercent.toFixed(0)}%` : "--"}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[#e8eaef] dark:bg-background/60">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#b8aeff] via-[var(--auth-accent)] to-[#5546e8] transition-[width] duration-500"
                style={{ width: `${hasSub ? remainingPercent : 0}%` }}
              />
            </div>
          </div>
        </section>

        {/* Bottom action — same breathing room as home footer stack */}
        <div className="mx-auto mt-auto flex w-full max-w-[340px] shrink-0 flex-col gap-2.5 pt-3 pb-1">
          {tunHelperReady ? (
            <button
              type="button"
              onClick={() => void handleUninstallHelper()}
              disabled={uninstallingHelper || authLoading}
              className="h-11 w-full cursor-pointer rounded-full border border-[#eceef1] bg-white text-[14px] font-semibold text-[#6b7280] transition-all hover:bg-[#f8f9fb] active:scale-[0.98] disabled:opacity-60 dark:border-border dark:bg-card dark:text-muted-foreground"
            >
              {uninstallingHelper ? "卸载中…" : "卸载虚拟网卡组件"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void handleLogout()}
            disabled={authLoading}
            className="h-11 w-full cursor-pointer rounded-full bg-[#f1f2f4] text-[15px] font-bold text-[#1a1d21] transition-all hover:bg-[#e8eaed] active:scale-[0.98] disabled:opacity-60 dark:bg-muted dark:text-foreground"
          >
            {authLoading ? "退出中…" : "退出登录"}
          </button>
        </div>
      </div>
    </div>
  )
}
