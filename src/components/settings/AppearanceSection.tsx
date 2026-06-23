import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { useTheme } from "../ThemeProvider"
import { getAutoStart, setAutoStartStore, getMinimizeToTray, setMinimizeToTrayStore } from "../../single/store"

const I = {
  Desktop: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  ),
  Moon: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  ),
  Sun: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  ),
  Globe: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
  Rocket: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" /><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </svg>
  ),
  Minimize: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M8 3v3a2 2 0 0 1-2 2H3" /><path d="M21 8h-3a2 2 0 0 1-2-2V3" />
      <path d="M3 16h3a2 2 0 0 1 2 2v3" /><path d="M21 16h-3a2 2 0 0 0-2 2v3" />
    </svg>
  ),
  Sliders: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  ),
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-12 h-7 rounded-full p-0.5 transition-colors relative shadow-inner shrink-0 cursor-pointer ${on ? "bg-secondary" : "bg-border-light dark:bg-black/30"}`}
    >
      <div className={`w-6 h-6 rounded-full bg-white shadow-sm transition-transform absolute top-0.5 ${on ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  )
}

export default function AppearanceSection() {
  const { i18n } = useTranslation()
  const { theme, mode, setMode } = useTheme()
  const l = (en: string, zh: string) => (i18n.language.startsWith("zh") ? zh : en)

  const [autoStart, setAutoStart] = useState(true)
  const [minimizeToTray, setMinimizeToTray] = useState(true)

  useEffect(() => {
    Promise.all([getAutoStart(), getMinimizeToTray()]).then(([a, m]) => {
      setAutoStart(a)
      setMinimizeToTray(m)
    })
  }, [])

  const persist = (fn: () => Promise<void>) => fn().catch((e: unknown) => console.error("Failed to save setting:", e))

  const themeIcon = mode === "system" ? <I.Desktop /> : theme === "dark" ? <I.Moon /> : <I.Sun />
  const themeDesc = mode === "system" ? l("Follow system", "跟随系统") : theme === "dark" ? l("Dark mode", "深色模式") : l("Light mode", "浅色模式")

  return (
    <div className="glass-card rounded-[24px] p-6 shadow-glass h-fit shrink-0">
      <div className="flex items-center gap-3 mb-5">
        <span className="w-8 h-8 rounded-xl flex items-center justify-center bg-secondary/15 text-secondary"><I.Sliders /></span>
        <h3 className="text-sm font-extrabold text-text tracking-wide">{l("Appearance & Behavior", "外观与运行")}</h3>
      </div>

      <div className="flex flex-col gap-2.5">
        {/* Theme */}
        <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-surface-active/15 border border-border-glass/40 hover:bg-surface-active/25 transition-colors">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-secondary/10 text-secondary">{themeIcon}</div>
            <div className="min-w-0">
              <div className="font-bold text-text text-sm whitespace-nowrap truncate">{l("Theme", "外观主题")}</div>
              <div className="text-xs text-text-muted mt-0.5 whitespace-nowrap truncate">{themeDesc}</div>
            </div>
          </div>
          <div className="flex bg-surface-active/50 rounded-lg p-1 border border-border-glass select-none shrink-0">
            {(["system", "dark", "light"] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => setMode(opt)}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer whitespace-nowrap ${mode === opt ? "glass-active-pill" : "text-text-muted hover:text-text"}`}
              >{opt === "system" ? l("System", "系统") : opt === "dark" ? l("Dark", "深色") : l("Light", "浅色")}</button>
            ))}
          </div>
        </div>

        {/* Language */}
        <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-surface-active/15 border border-border-glass/40 hover:bg-surface-active/25 transition-colors">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-purple-500/10 text-purple-500"><I.Globe /></div>
            <div className="min-w-0">
              <div className="font-bold text-text text-sm whitespace-nowrap truncate">{l("Language", "语言设置")}</div>
              <div className="text-xs text-text-muted mt-0.5 whitespace-nowrap truncate">{l("Display language", "界面显示语言")}</div>
            </div>
          </div>
          <div className="flex bg-surface-active/50 rounded-lg p-1 border border-border-glass select-none shrink-0">
            <button
              onClick={() => i18n.changeLanguage("zh-CN")}
              className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${i18n.language.startsWith("zh") ? "glass-active-pill" : "text-text-muted hover:text-text"}`}
            >中文</button>
            <button
              onClick={() => i18n.changeLanguage("en")}
              className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${!i18n.language.startsWith("zh") ? "glass-active-pill" : "text-text-muted hover:text-text"}`}
            >English</button>
          </div>
        </div>

        {/* Auto-start */}
        <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-surface-active/15 border border-border-glass/40 hover:bg-surface-active/25 transition-colors">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-success/10 text-success"><I.Rocket /></div>
            <div className="min-w-0">
              <div className="font-bold text-text text-sm whitespace-nowrap truncate">{l("Auto-start on boot", "开机自动启动")}</div>
              <div className="text-xs text-text-muted mt-0.5 whitespace-nowrap truncate">{l("Launch app on system start", "系统启动时自动运行")}</div>
            </div>
          </div>
          <Toggle on={autoStart} onClick={() => { const next = !autoStart; setAutoStart(next); persist(() => setAutoStartStore(next)) }} />
        </div>

        {/* Minimize to tray */}
        <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-surface-active/15 border border-border-glass/40 hover:bg-surface-active/25 transition-colors">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-orange-500/10 text-orange-500"><I.Minimize /></div>
            <div className="min-w-0">
              <div className="font-bold text-text text-sm whitespace-nowrap truncate">{l("Minimize to tray", "关闭窗口到托盘")}</div>
              <div className="text-xs text-text-muted mt-0.5 whitespace-nowrap truncate">{l("Close window to system tray", "关闭窗口时最小化到托盘")}</div>
            </div>
          </div>
          <Toggle on={minimizeToTray} onClick={() => { const next = !minimizeToTray; setMinimizeToTray(next); persist(() => setMinimizeToTrayStore(next)) }} />
        </div>
      </div>
    </div>
  )
}
