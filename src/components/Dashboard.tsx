import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Routes, Route } from "react-router-dom"
import Sidebar from "./Sidebar"
import ConnectionButton from "./ConnectionButton"
import SubscriptionPage from "./SubscriptionPage"
import ModeSelector, { type ProxyMode } from "./ModeSelector"
import { useTheme } from "./ThemeProvider"
import { Badge } from "./ui/badge"
import { cn } from "@/lib/utils"

/* ── Icons ── */
const I = {
  Globe: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20"/><path d="M2 12h20"/></svg>),
  Shield: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>),
  BarChart3: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>),
  Sun: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>),
  Moon: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>),
  Download: () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>),
  Upload: () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17,8 12,3 7,8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>),
}

/* ================================================================
   Home Page
   ================================================================ */
function HomePage() {
  const { t } = useTranslation()
  const [proxyMode, setProxyMode] = useState<ProxyMode>("rule")

  return (
    <div className="flex flex-col items-center gap-6 animate-fade-in">
      {/* ======== 中央连接卡片 ======== */}
      <div className="glass-card rounded-2xl w-full max-w-md flex flex-col items-center py-10 px-8 gap-5">
        {/* 连接按钮 */}
        <ConnectionButton />

        {/* 当前节点 */}
        <div className="flex items-center gap-2.5 text-sm">
          <span className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-[11px] font-bold font-mono text-white shrink-0">JP</span>
          <span className="font-medium text-text">日本 · Tokyo</span>
          <span className="text-xs text-text-muted font-mono">45ms</span>
        </div>

        {/* 实时速度 */}
        <div className="flex items-center gap-5 text-[13px]">
          <span className="flex items-center gap-1.5 text-primary font-mono font-medium">
            <I.Download /> -- KB/s
          </span>
          <span className="flex items-center gap-1.5 text-secondary font-mono font-medium">
            <I.Upload /> -- KB/s
          </span>
        </div>
      </div>

      {/* ======== 三列指标卡片 ======== */}
      <div className="grid grid-cols-3 gap-4 w-full">
        {/* 当前套餐 */}
        <div className="glass-card rounded-2xl p-5 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent-purple flex items-center justify-center text-accent-purple-text">
              <I.Shield />
            </div>
            <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">{t("current_plan")}</span>
          </div>
          <div className="text-2xl font-bold font-heading">{t("pro_plan")}</div>
          <div className="flex items-center justify-between mt-auto">
            <span className="text-xs text-text-muted">¥19.9/月 · 07-12 到期</span>
            <Badge variant="success" className="text-[10px]">Active</Badge>
          </div>
        </div>

        {/* 已用流量 */}
        <div className="glass-card rounded-2xl p-5 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent-blue flex items-center justify-center text-accent-blue-text">
              <I.BarChart3 />
            </div>
            <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">{t("data_usage")}</span>
          </div>
          <div className="text-2xl font-bold font-heading">
            12.5 <span className="text-sm font-normal text-text-muted">/ 20 GB</span>
          </div>
          <div className="mt-auto">
            <div className="w-full h-1.5 rounded-full bg-border-light overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-primary to-secondary" style={{ width: "62%" }} />
            </div>
            <div className="flex justify-between mt-1 text-[10px] text-text-muted">
              <span>62%</span><span>剩余 30 天</span>
            </div>
          </div>
        </div>

        {/* 代理模式 */}
        <div className="glass-card rounded-2xl p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent-yellow flex items-center justify-center text-accent-yellow-text">
              <I.Globe />
            </div>
            <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">代理模式</span>
          </div>
          <ModeSelector mode={proxyMode} onChange={setProxyMode} />
        </div>
      </div>
    </div>
  )
}

/* ================================================================
   Settings Page
   ================================================================ */
function SettingsPage() {
  const { t, i18n } = useTranslation()
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="animate-fade-in settings-grid">
      <h2 className="text-xl font-bold mb-2">{t("nav_settings")}</h2>

      <div className="glass-card rounded-2xl p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bento-icon">{theme === "dark" ? <I.Moon /> : <I.Sun />}</div>
          <div>
            <div className="text-sm font-medium">外观</div>
            <div className="text-xs text-text-muted">{theme === "dark" ? "深色模式" : "浅色模式"}</div>
          </div>
        </div>
        <button className={cn("toggle", theme === "dark" && "active")} onClick={toggleTheme} />
      </div>

      <div className="glass-card rounded-2xl p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bento-icon"><I.Globe /></div>
          <div>
            <div className="text-sm font-medium">语言</div>
            <div className="text-xs text-text-muted">{i18n.language.startsWith("zh") ? "简体中文" : "English"}</div>
          </div>
        </div>
        <div className="lang-selector">
          <button className={cn("lang-option", i18n.language.startsWith("zh") && "active")} onClick={() => i18n.changeLanguage("zh")}>中</button>
          <button className={cn("lang-option", i18n.language === "en" && "active")} onClick={() => i18n.changeLanguage("en")}>EN</button>
        </div>
      </div>
    </div>
  )
}

/* ================================================================
   Layout
   ================================================================ */
export default function Dashboard() {
  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="main-area">
        <Routes>
          <Route index element={<HomePage />} />
          <Route path="subscription" element={<SubscriptionPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  )
}
