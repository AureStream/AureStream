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

  const StatRow = ({ label, value }: { label: string; value: string }) => (
    <div className="flex justify-between items-center bg-surface-active/15 border border-border-glass/30 rounded-xl px-3.5 py-2.5">
      <span className="text-xs text-text-secondary">{label}</span>
      <span className="text-xs font-bold text-text tabular-nums">{value}</span>
    </div>
  )

  return (
    <div className="flex flex-col w-full h-full max-w-[420px] mx-auto animate-fade-in">
      <MobileTopBar onBack={() => navigate("/dashboard")} title={l("My", "我的")} />

      <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-5 flex flex-col gap-4">
        {/* User info card */}
        <div className="glass-card rounded-[24px] p-5 shadow-glass flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-full bg-secondary p-[3px] shadow-glow-primary mb-3 animate-pulse-slow">
            <div className="w-full h-full rounded-full bg-surface flex items-center justify-center overflow-hidden">
              <img src="/avatar.svg" alt="User" className="w-full h-full aspect-square shrink-0 object-cover" />
            </div>
          </div>

          <h2 className="font-heading font-extrabold text-text text-xl leading-tight tracking-tight">{displayName}</h2>

          <div className="text-[10px] text-secondary bg-secondary/10 border border-secondary/15 px-3 py-1 rounded-full font-bold inline-flex items-center gap-1.5 mt-2.5">
            <I.Crown /> {hasSub ? l("Premium Pro Client", "专业版尊享用户") : l("Free Tier Client", "免费体验用户")}
          </div>

          <div className="w-full px-1 text-left mt-4">
            <span className="text-[10px] font-extrabold text-text-muted uppercase tracking-wider">{l("Registered Email", "绑定邮箱")}</span>
            <div className="flex items-center gap-2.5 mt-2 bg-surface-active/15 border border-border-glass/30 rounded-xl px-3.5 py-2.5">
              <span className="text-text-secondary shrink-0"><I.Mail /></span>
              <span className="text-xs font-bold text-text truncate select-all">{emailUser}</span>
            </div>
          </div>
        </div>

        {/* Traffic + expiry card (only fields with real data) */}
        <div className="glass-card rounded-[24px] p-5 shadow-glass flex flex-col gap-4 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-tr from-secondary/5 to-accent-purple/5 pointer-events-none z-0" />

          <div className="relative z-10 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <span className="text-secondary"><I.Shield /></span>
              <h3 className="text-sm font-extrabold text-text uppercase tracking-wider">{l("Traffic", "流量信息")}</h3>
            </div>

            {/* Remaining — prominent */}
            <div className="flex flex-col items-center text-center">
              <div className="text-3xl font-extrabold font-mono tracking-tight text-text leading-none">
                {remainingText}<span className="text-sm text-text-muted ml-1">{remainingText === "--" || remainingText.includes("TB") ? "" : "GB"}</span>
              </div>
              <div className="text-xs text-text-muted mt-1.5">{l("Remaining this month", "本月剩余流量")}</div>
            </div>

            {/* Progress bar */}
            <div className="w-full h-2 rounded-full bg-border-glass overflow-hidden shadow-inner">
              <div className="h-full rounded-full bg-gradient-to-r from-secondary to-accent-purple" style={{ width: `${percentUsed}%` }} />
            </div>

            {/* Detail rows */}
            <div className="flex flex-col gap-2">
              <StatRow label={l("Used this month", "本月已使用流量")} value={`${usedGB} GB`} />
              <StatRow label={l("Total this month", "本月总流量")} value={totalText} />
              <StatRow label={l("Plan ends", "套餐结束时间")} value={expireText} />
            </div>
          </div>
        </div>

        <div className="flex-1" />

        {/* Renewal placeholder button */}
        <button
          onClick={handleRenew}
          className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-secondary to-accent-purple hover:opacity-90 active:scale-[0.98] transition-all text-white font-extrabold shadow-md text-sm cursor-pointer flex items-center justify-center gap-2"
        >
          <I.Crown /> {l("Renew", "续费")}
        </button>

        {/* Logout */}
        <button
          onClick={() => logout().then(() => navigate('/login'))}
          className="w-full py-3 rounded-2xl bg-surface-active/40 hover:bg-surface-active/70 border border-border-glass text-text-secondary hover:text-text transition-all font-bold text-sm cursor-pointer flex items-center justify-center gap-2"
        >
          <I.LogOut /> {l("Log Out", "退出登录")}
        </button>
      </div>
    </div>
  )
}