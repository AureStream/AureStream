import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../contexts/AuthContext"
import { getLocalSubscriptions } from "../action/db"
import { message } from "@tauri-apps/plugin-dialog"
import MobileTopBar from "./MobileTopBar"

const ONE_GB_BYTES = 1024 * 1024 * 1024
const ONE_TB_BYTES = 1024 * 1024 * 1024 * 1024

/* ── Icons ── */
const I = {
  Mail: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>),
  Shield: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>),
  Crown: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="2 15 7 22 17 22 22 15 17 9 12 15 7 9 2 15"/></svg>),
  LogOut: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>),
}

export default function ProfilePage() {
  const { i18n } = useTranslation()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const l = (en: string, zh: string) => i18n.language.startsWith('zh') ? zh : en;
  const formatDate = (ts: number) => {
    const d = new Date(ts * 1000)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return i18n.language.startsWith('zh')
      ? `${y}年${m}月${day}日`
      : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  const emailUser = user?.email ?? "User";
  const displayName = emailUser.split('@')[0];

  const [subs, setSubs] = useState<any[]>([])

  useEffect(() => {
    const loadSubsData = async () => {
      try {
        const localData = await getLocalSubscriptions()
        if (localData && localData.length > 0) {
          setSubs(localData)
        }
      } catch (e) {
        console.error("Failed to load subscription in profile page:", e)
      }
    }
    loadSubsData()
  }, [])

  const hasSub = subs.length > 0
  const sub = subs[0]
  const trafficTotal = (hasSub && sub.traffic_total > 1) ? sub.traffic_total : ONE_TB_BYTES
  const isTrafficTotalFallback = !hasSub || sub.traffic_total <= 1
  const trafficUsed = hasSub ? sub.traffic_used : 0
  const remainingBytes = Math.max(0, trafficTotal - trafficUsed)
  const remainingText = !hasSub
    ? "--"
    : (remainingBytes >= ONE_TB_BYTES
        ? `${(remainingBytes / ONE_TB_BYTES).toFixed(2)} TB`
        : `${(remainingBytes / ONE_GB_BYTES).toFixed(1)}`)
  const usedGB = hasSub ? (trafficUsed / ONE_GB_BYTES).toFixed(1) : "0.0"
  const totalText = isTrafficTotalFallback ? "1 TB" : `${(sub.traffic_total / ONE_GB_BYTES).toFixed(0)} GB`
  const percentUsed = trafficTotal > 0 ? Math.min(100, Math.round((trafficUsed / trafficTotal) * 100)) : 0
  const expireText = hasSub && sub.expire_time ? formatDate(sub.expire_time) : "--"

  const handleRenew = async () => {
    await message(l("Renewal is coming soon.", "续费功能即将推出，敬请期待。"), {
      title: l("Renew", "续费"),
      kind: "info",
      okLabel: l("OK", "确定"),
    })
  }

  const DetailRow = ({ label, value }: { label: string; value: string }) => (
    <div className="flex items-center justify-between py-3 border-b border-slate-200/55 dark:border-white/8 last:border-b-0">
      <span className="text-xs font-bold text-text-muted">{label}</span>
      <span className="text-sm font-black text-text tabular-nums">{value}</span>
    </div>
  )

  return (
    <div className="flex h-full w-full flex-col animate-fade-in overflow-hidden">
      <MobileTopBar onBack={() => navigate("/dashboard")} title={l("My", "我的")} />

      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-5 pb-5 pt-4 flex flex-col justify-between gap-6">
        <div className="flex flex-col gap-7">
          {/* User hero */}
          <section className="relative flex flex-col items-center text-center pt-2">
            <div className="absolute top-3 h-[8.5rem] w-[8.5rem] rounded-full bg-[#6C5CFF]/12 blur-3xl pointer-events-none" />
            <div className="relative w-24 h-24 rounded-full bg-secondary p-[3px] shadow-lg shadow-[#6C5CFF]/20">
              <div className="w-full h-full rounded-full bg-surface flex items-center justify-center overflow-hidden">
                <img src="/avatar.svg" alt="User" className="w-full h-full aspect-square shrink-0 object-cover" />
              </div>
            </div>

            <h2 className="relative font-heading font-black text-text text-3xl leading-tight tracking-tight mt-5">{displayName}</h2>

            <div className="relative text-xs text-secondary bg-secondary/10 px-3.5 py-1.5 rounded-full font-black inline-flex items-center gap-1.5 mt-3">
              <I.Crown /> {hasSub ? l("Premium Pro Client", "专业版尊享用户") : l("Free Tier Client", "免费体验用户")}
            </div>

            <div className="relative flex items-center gap-2.5 mt-4 max-w-full text-text-secondary">
              <span className="shrink-0"><I.Mail /></span>
              <span className="text-sm font-bold truncate select-all">{emailUser}</span>
            </div>
          </section>

          {/* Traffic summary */}
          <section className="relative rounded-[34px] bg-white dark:bg-bg-alt p-5 shadow-sm border border-slate-100 dark:border-white/10 overflow-hidden">
            <div className="absolute -top-14 -right-14 h-36 w-36 rounded-full bg-[#6C5CFF]/12 blur-2xl pointer-events-none" />
            <div className="absolute -bottom-16 -left-16 h-36 w-36 rounded-full bg-accent-purple/40 blur-2xl pointer-events-none" />

            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-secondary"><I.Shield /></span>
                <h3 className="text-sm font-black text-text uppercase tracking-wider">{l("Traffic", "流量信息")}</h3>
              </div>
              <span className="text-xs font-black text-secondary tabular-nums">{100 - percentUsed}% {l("Left", "剩余")}</span>
            </div>

            <div className="relative pt-6 pb-4">
              <div className="flex items-end gap-1.5">
                <span className="text-5xl font-black font-mono tracking-tight text-text leading-none">
                  {remainingText}
                </span>
                <span className="text-base text-text-muted font-black mb-1.5">
                  {remainingText === "--" || remainingText.includes("TB") ? "" : "GB"}
                </span>
              </div>
              <div className="text-sm text-text-muted font-bold mt-2">{l("Remaining this month", "本月剩余流量")}</div>
            </div>

            <div className="relative w-full h-2.5 rounded-full bg-slate-100 dark:bg-white/8 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-secondary to-[#8B7CFF]" style={{ width: `${percentUsed}%` }} />
            </div>

            <div className="relative mt-4">
              <DetailRow label={l("Used this month", "本月已使用流量")} value={`${usedGB} GB`} />
              <DetailRow label={l("Total this month", "本月总流量")} value={totalText} />
              <DetailRow label={l("Plan ends", "套餐结束时间")} value={expireText} />
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-3 pt-1">
          {/* Renewal placeholder button */}
          <button
            onClick={handleRenew}
            className="w-full h-14 rounded-[22px] bg-gradient-to-r from-secondary to-[#8B7CFF] hover:opacity-90 active:scale-[0.98] transition-all text-white font-black shadow-md shadow-[#6C5CFF]/18 text-sm cursor-pointer flex items-center justify-center gap-2"
          >
            <I.Crown /> {l("Renew", "续费")}
          </button>

          {/* Logout */}
          <button
            onClick={() => logout().then(() => navigate('/login'))}
            className="w-full h-[3.25rem] rounded-[22px] bg-white/45 dark:bg-white/6 hover:bg-white/70 dark:hover:bg-white/10 text-text-secondary hover:text-text transition-all font-black text-sm cursor-pointer flex items-center justify-center gap-2"
          >
            <I.LogOut /> {l("Log Out", "退出登录")}
          </button>
        </div>
      </div>
    </div>
  )
}
