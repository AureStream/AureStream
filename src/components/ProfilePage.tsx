import { useState, useEffect, type CSSProperties } from "react"
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
  const subscriptionTimeText =
    hasSub && sub.created_at
      ? formatDate(sub.created_at)
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

  const r = 42
  const c = 2 * Math.PI * r
  const dashOffset = c * (1 - remainingPercent / 100)

  return (
    <div className="relative flex h-full w-full flex-col animate-fade-in overflow-hidden bg-transparent">
      <div className="w-full shrink-0">
        <MobileTopBar
          onBack={() => navigate("/dashboard")}
          right={
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                void logout()
                navigate("/login", { replace: true })
              }}
              className={topBarIconBtnClass}
              style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
              aria-label={l("Log Out", "退出登录")}
              title={l("Log Out", "退出登录")}
            >
              <I.LogOut />
            </button>
          }
        />
      </div>

      <div className="relative flex-1 min-h-0 w-full px-4 pb-6 pt-5 flex flex-col gap-4">
        {/* User */}
        <section className="shrink-0 flex items-center gap-4 px-5 pb-7 min-h-[6.75rem]">
          <div className="w-[4.45rem] h-[4.45rem] rounded-full bg-white dark:bg-bg-alt border border-white/70 shadow-sm overflow-hidden shrink-0">
            <img src="/avatar.svg" alt="" className="w-full h-full object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h2 className="text-[1.5rem] font-black text-slate-800 truncate leading-none tracking-tight">{displayName}</h2>
              <button
                type="button"
                onClick={handleChangePassword}
                className="text-xs font-bold text-slate-600 underline underline-offset-2 cursor-pointer hover:text-[#6C5CFF]"
              >
                {l("Change Password", "修改密码")}
              </button>
            </div>
            <p className="mt-1.5 text-[1rem] font-semibold text-slate-700 truncate">{emailUser}</p>
          </div>
        </section>

        {/* Balance */}
        <section className="shrink-0 relative overflow-hidden rounded-[0.7rem] bg-gradient-to-r from-[#7357F6] via-[#7C5EF8] to-[#8155F1] px-5 py-5 text-white shadow-sm min-h-[5.25rem]">
          <div className="absolute right-12 -top-20 h-48 w-24 rotate-[16deg] rounded-full bg-white/10 pointer-events-none" />
          <div className="absolute right-24 -top-16 h-44 w-20 rotate-[16deg] rounded-full bg-white/6 pointer-events-none" />
          <div className="relative flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[1.75rem] font-black tabular-nums tracking-tight leading-none">{balanceText}</div>
              <div className="mt-2 flex items-center gap-2 text-base font-bold text-white/95">
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
              className="shrink-0 h-9 min-w-[4.2rem] px-4 rounded-full bg-gradient-to-r from-[#FFE2BE] to-[#FFC584] text-[#5F350B] text-sm font-black shadow-sm hover:opacity-95 active:scale-[0.98] transition-all cursor-pointer"
            >
              {l("Top Up", "充值")}
            </button>
          </div>
        </section>

        {/* Traffic — fills remaining height */}
        <section className="flex-1 min-h-0 flex flex-col items-stretch justify-center gap-8 rounded-[0.7rem] bg-white border border-slate-100/80 px-5 pt-11 pb-7 shadow-[0_8px_26px_rgba(31,27,62,0.08)]">
          <div className="grid grid-cols-2 place-items-center gap-4">
            <div className="relative w-[10.25rem] h-[10.25rem] justify-self-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
                <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeWidth="5" className="text-slate-200" />
                <circle
                  cx="50"
                  cy="50"
                  r={r}
                  fill="none"
                  stroke="#28D081"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={c}
                  strokeDashoffset={dashOffset}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2">
                <div className="text-[1.45rem] font-black tabular-nums text-slate-800 leading-none">
                  {remainingGBValue}
                  {remainingUnitLabel ? <span className="text-[0.85rem] font-bold text-slate-700 ml-0.5">{remainingUnitLabel}</span> : null}
                </div>
                <div className="mt-2 text-base font-extrabold text-slate-400 leading-tight">
                  {l("Plan remaining traffic", "套餐剩余流量")}
                </div>
              </div>
            </div>

            <div className="min-w-0 flex flex-col items-center gap-5 justify-self-center w-full max-w-[9rem] text-center">
              <div className="flex items-start justify-center gap-2">
                <span className="mt-1.5 w-2 h-2 rounded-full bg-slate-300 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-400">{l("Plan used traffic", "套餐已使用流量")}</div>
                  <div className="mt-1 text-[1.32rem] font-black tabular-nums text-slate-800 leading-none">{usedGB}<span className="text-xs ml-0.5">GB</span></div>
                </div>
              </div>
              <div className="flex items-start justify-center gap-2">
                <span className="mt-1.5 w-2 h-2 rounded-full bg-[#28D081] shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-400">{l("Plan total traffic", "套餐总流量")}</div>
                  <div className="mt-1 text-[1.32rem] font-black tabular-nums text-slate-800 leading-none">{totalDisplay}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5 pt-0 text-center">
            <div>
              <div className="text-base font-extrabold text-slate-400 leading-tight">{l("Subscription time", "套餐订阅时间")}</div>
              <div className="mt-1 text-[1.05rem] font-black text-slate-800 leading-tight">{subscriptionTimeText}</div>
            </div>
            <div>
              <div className="text-base font-extrabold text-slate-400 leading-tight">{l("Plan ends", "套餐结束时间")}</div>
              <div className="mt-1 text-[1.05rem] font-black text-slate-800 leading-tight">{expireText}</div>
            </div>
          </div>

          <div className="flex justify-center pt-1">
            <button
              type="button"
              onClick={handleTrafficBoost}
              className="h-10 px-9 rounded-full bg-gradient-to-r from-[#7357F6] to-[#8155F1] hover:opacity-95 active:scale-[0.98] transition-all text-white text-sm font-black cursor-pointer inline-flex items-center gap-2 shadow-sm shadow-[#6C5CFF]/20"
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
          className="shrink-0 w-full h-11 rounded-full bg-gradient-to-r from-[#FFE0B6] to-[#FFC083] hover:opacity-95 active:scale-[0.98] transition-all text-[#3F2507] font-black text-base cursor-pointer"
        >
          {l("Renew", "续费")}
        </button>
      </div>
    </div>
  )
}
