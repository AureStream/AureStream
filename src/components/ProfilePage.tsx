import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../contexts/AuthContext"
import { getLocalSubscriptions } from "../action/db"
import { message } from "@tauri-apps/plugin-dialog"
import MobileTopBar, { topBarIconBtnClass } from "./MobileTopBar"

const ONE_GB_BYTES = 1024 * 1024 * 1024
const ONE_TB_BYTES = 1024 * 1024 * 1024 * 1024

const I = {
  LogOut: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  Bag: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  ),
}

export default function ProfilePage() {
  const { i18n } = useTranslation()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const l = (en: string, zh: string) => (i18n.language.startsWith("zh") ? zh : en)

  const formatDate = (ts: number) => {
    const d = new Date(ts * 1000)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return i18n.language.startsWith("zh")
      ? `${y}年${m}月${day}日`
      : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
  }

  const emailUser = user?.email ?? "User"
  const displayName = emailUser.split("@")[0]

  const [subs, setSubs] = useState<any[]>([])
  const [accountBalance] = useState(0)

  useEffect(() => {
    const loadSubsData = async () => {
      try {
        const localData = await getLocalSubscriptions()
        if (localData && localData.length > 0) setSubs(localData)
      } catch (e) {
        console.error("Failed to load subscription in profile page:", e)
      }
    }
    loadSubsData()
  }, [])

  const hasSub = subs.length > 0
  const sub = subs[0]
  const trafficTotal = hasSub && sub.traffic_total > 1 ? sub.traffic_total : ONE_TB_BYTES
  const isTrafficTotalFallback = !hasSub || sub.traffic_total <= 1
  const trafficUsed = hasSub ? sub.traffic_used : 0
  const remainingBytes = Math.max(0, trafficTotal - trafficUsed)

  const remainingGBValue = !hasSub
    ? "--"
    : remainingBytes >= ONE_TB_BYTES
      ? (remainingBytes / ONE_TB_BYTES).toFixed(1)
      : (remainingBytes / ONE_GB_BYTES).toFixed(1)

  const remainingUnitLabel = !hasSub ? "" : remainingBytes >= ONE_TB_BYTES ? "TB" : "GB"
  const usedGB = hasSub ? (trafficUsed / ONE_GB_BYTES).toFixed(1) : "0.0"
  const totalDisplay = isTrafficTotalFallback
    ? "1 TB"
    : `${(sub.traffic_total / ONE_GB_BYTES).toFixed(0)} GB`

  const remainingPercent = trafficTotal > 0
    ? Math.max(0, Math.min(100, Math.round((remainingBytes / trafficTotal) * 100)))
    : 0

  const expireText = hasSub && sub.expire_time ? formatDate(sub.expire_time) : "--"
  const resetText =
    hasSub && sub.created_at
      ? formatDate(sub.created_at + 30 * 24 * 3600)
      : hasSub && sub.expire_time
        ? formatDate(Math.max(Math.floor(Date.now() / 1000), sub.expire_time - 30 * 24 * 3600))
        : "--"

  const balanceText = accountBalance.toFixed(1)

  const comingSoon = async (title: string, body: string) => {
    await message(body, { title, kind: "info", okLabel: l("OK", "确定") })
  }

  const handleChangePassword = () =>
    comingSoon(l("Change Password", "修改密码"), l("Coming soon.", "修改密码功能即将推出，敬请期待。"))
  const handleRecharge = () =>
    comingSoon(l("Top Up", "充值"), l("Top-up is coming soon.", "充值功能即将推出，敬请期待。"))
  const handleDetails = () =>
    comingSoon(l("Details", "明细"), l("Balance details are coming soon.", "余额明细功能即将推出，敬请期待。"))
  const handleTrafficBoost = () =>
    comingSoon(l("Data Add-on", "流量加油"), l("Data add-on is coming soon.", "流量加油功能即将推出，敬请期待。"))
  const handleRenew = () =>
    comingSoon(l("Renew", "续费"), l("Renewal is coming soon.", "续费功能即将推出，敬请期待。"))

  const r = 36
  const c = 2 * Math.PI * r
  const dashOffset = c * (1 - remainingPercent / 100)

  return (
    <div className="flex h-full w-full flex-col animate-fade-in overflow-hidden">
      <div className="w-full shrink-0">
        <MobileTopBar
          onBack={() => navigate("/dashboard")}
          right={
            <button
              onClick={() => logout().then(() => navigate("/login"))}
              className={topBarIconBtnClass}
              aria-label={l("Log Out", "退出登录")}
              title={l("Log Out", "退出登录")}
            >
              <I.LogOut />
            </button>
          }
        />
      </div>

      <div className="flex-1 min-h-0 w-full px-4 pb-5 pt-1 flex flex-col gap-3.5">
        {/* User */}
        <section className="shrink-0 flex items-center gap-3.5">
          <div className="w-[3.75rem] h-[3.75rem] rounded-full bg-white dark:bg-bg-alt border border-slate-200/70 dark:border-white/10 overflow-hidden shrink-0">
            <img src="/avatar.svg" alt="" className="w-full h-full object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2.5 flex-wrap">
              <h2 className="text-[1.125rem] font-black text-text truncate leading-none">{displayName}</h2>
              <button
                type="button"
                onClick={handleChangePassword}
                className="text-xs font-bold text-[#6C5CFF] underline underline-offset-2 cursor-pointer hover:opacity-80"
              >
                {l("Change Password", "修改密码")}
              </button>
            </div>
            <p className="mt-1.5 text-sm font-medium text-text-muted truncate">{emailUser}</p>
          </div>
        </section>

        {/* Balance */}
        <section className="shrink-0 relative overflow-hidden rounded-[1.15rem] bg-gradient-to-r from-[#6B5CFF] via-[#7466FF] to-[#8B7CFF] px-5 py-[1.15rem] text-white">
          <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/10 pointer-events-none" />
          <div className="relative flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[2.15rem] font-black tabular-nums tracking-tight leading-none">{balanceText}</div>
              <div className="mt-2 flex items-center gap-2 text-xs font-semibold text-white/90">
                <span>{l("Account Balance (CNY)", "账户余额 (元)")}</span>
                <button
                  type="button"
                  onClick={handleDetails}
                  className="underline underline-offset-2 cursor-pointer hover:text-white"
                >
                  {l("Details", "明细")}
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={handleRecharge}
              className="shrink-0 h-9 min-w-[4.75rem] px-5 rounded-full bg-gradient-to-r from-[#FF9A5A] to-[#FFC07A] text-white text-sm font-black shadow-sm hover:opacity-95 active:scale-[0.98] transition-all cursor-pointer"
            >
              {l("Top Up", "充值")}
            </button>
          </div>
        </section>

        {/* Traffic — fills remaining height */}
        <section className="flex-1 min-h-0 flex flex-col justify-between rounded-[1.15rem] bg-white dark:bg-bg-alt border border-slate-100/90 dark:border-white/10 px-4 py-5 shadow-[0_10px_28px_rgba(31,27,62,0.05)]">
          <div className="flex items-center gap-4">
            <div className="relative w-[7.5rem] h-[7.5rem] shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
                <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeWidth="7.5" className="text-slate-100 dark:text-slate-700" />
                <circle
                  cx="50"
                  cy="50"
                  r={r}
                  fill="none"
                  stroke="#34D399"
                  strokeWidth="7.5"
                  strokeLinecap="round"
                  strokeDasharray={c}
                  strokeDashoffset={dashOffset}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2">
                <div className="text-[1.05rem] font-black tabular-nums text-text leading-none">
                  {remainingGBValue}
                  {remainingUnitLabel ? <span className="text-[11px] font-bold text-text-muted ml-0.5">{remainingUnitLabel}</span> : null}
                </div>
                <div className="mt-1.5 text-[10px] font-bold text-text-muted leading-tight">
                  {l("Remaining this month", "本月剩余流量")}
                </div>
              </div>
            </div>

            <div className="flex-1 min-w-0 flex flex-col gap-4">
              <div className="flex items-start gap-2">
                <span className="mt-1.5 w-2 h-2 rounded-full bg-slate-300 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-bold text-text-muted">{l("Used this month", "本月已使用流量")}</div>
                  <div className="mt-1 text-sm font-black tabular-nums text-text">{usedGB} GB</div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-1.5 w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-bold text-text-muted">{l("Total this month", "本月总流量")}</div>
                  <div className="mt-1 text-sm font-black tabular-nums text-text">{totalDisplay}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div>
              <div className="text-[11px] font-bold text-text-muted">{l("Traffic reset", "流量重置时间")}</div>
              <div className="mt-1.5 text-xs font-black text-text">{resetText}</div>
            </div>
            <div>
              <div className="text-[11px] font-bold text-text-muted">{l("Plan ends", "套餐结束时间")}</div>
              <div className="mt-1.5 text-xs font-black text-text">{expireText}</div>
            </div>
          </div>

          <div className="flex justify-center pt-1">
            <button
              type="button"
              onClick={handleTrafficBoost}
              className="h-9 px-6 rounded-full bg-[#6C5CFF] hover:bg-[#6252F4] active:scale-[0.98] transition-all text-white text-xs font-black cursor-pointer inline-flex items-center gap-1.5"
            >
              <I.Bag />
              {l("Data Add-on", "流量加油")}
            </button>
          </div>
        </section>

        {/* Renew pinned to bottom */}
        <button
          type="button"
          onClick={handleRenew}
          className="shrink-0 w-full h-12 rounded-full bg-gradient-to-r from-[#FF9A5A] to-[#FFC07A] hover:opacity-95 active:scale-[0.98] transition-all text-[#5A3200] font-black text-base cursor-pointer"
        >
          {l("Renew", "续费")}
        </button>
      </div>
    </div>
  )
}
