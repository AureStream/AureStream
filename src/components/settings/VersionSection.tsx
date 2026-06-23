import { useTranslation } from "react-i18next"
import { useUpdate } from "../../contexts/UpdateContext"
import { openUrl } from "@tauri-apps/plugin-opener"
import { SING_BOX_VERSION } from "../../types/definition"
import { type as getOsType } from "@tauri-apps/plugin-os"
import { useState, useEffect } from "react"

export default function VersionSection() {
  const { i18n } = useTranslation()
  const l = (en: string, zh: string) => (i18n.language.startsWith("zh") ? zh : en)
  const { updateAvailable, newVersion, checking, currentVersion, triggerCheck, performUpdate } = useUpdate()

  const [osType, setOsType] = useState("")

  useEffect(() => {
    try {
      const t = getOsType()
      setOsType(t === "macos" ? "macOS" : t === "windows" ? "Windows" : "Linux")
    } catch {
      setOsType("Desktop")
    }
  }, [])

  return (
    <div className="glass-card rounded-[24px] p-5 shadow-glass flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-3 mb-4">
        <span className="w-8 h-8 rounded-xl flex items-center justify-center bg-success/15 text-success">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
          </svg>
        </span>
        <h3 className="text-sm font-extrabold text-text tracking-wide">{l("Version & Update", "版本与更新")}</h3>
      </div>

      <div className="flex flex-col gap-3 flex-1 justify-between">
        {/* App Info & Core Engine */}
        <div className="flex flex-col p-3.5 rounded-2xl bg-surface-active/15 border border-border-glass/40">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-secondary to-purple-500 flex items-center justify-center shrink-0 text-white font-extrabold text-lg shadow-inner">
                A
              </div>
              <div className="min-w-0">
                <div className="font-bold text-text text-sm whitespace-nowrap truncate">AureStream {osType}</div>
                <div className="text-xs text-text-muted mt-0.5 whitespace-nowrap truncate">
                  {l("Version", "版本号")} <span className="font-mono font-bold text-text ml-0.5">{currentVersion || "..."}</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => openUrl("https://github.com/BadKid90s/AureStream")}
              className="px-3 py-1.5 text-xs font-bold text-secondary bg-secondary/10 hover:bg-secondary/20 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              GitHub
            </button>
          </div>
          
          <div className="h-[1px] w-full bg-border-glass/30 mb-3" />
          
          <div className="flex items-center justify-between min-w-0">
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="4" width="16" height="16" rx="2" ry="2" />
                <rect x="9" y="9" width="6" height="6" />
                <line x1="9" y1="1" x2="9" y2="4" />
                <line x1="15" y1="1" x2="15" y2="4" />
                <line x1="9" y1="20" x2="9" y2="23" />
                <line x1="15" y1="20" x2="15" y2="23" />
                <line x1="20" y1="9" x2="23" y2="9" />
                <line x1="20" y1="14" x2="23" y2="14" />
                <line x1="1" y1="9" x2="4" y2="9" />
                <line x1="1" y1="14" x2="4" y2="14" />
              </svg>
              {l("Core Engine", "核心引擎")}
            </div>
            <span className="font-mono font-bold text-xs text-text bg-surface-active/30 px-2 py-0.5 rounded-md">
              sing-box {SING_BOX_VERSION}
            </span>
          </div>
        </div>

        {/* Update Status */}
        <div className="flex flex-col gap-3 p-3.5 rounded-2xl bg-surface-active/15 border border-border-glass/40">
          <div className="min-w-0">
            <div className="font-bold text-text text-sm whitespace-nowrap truncate">
               {updateAvailable ? l("Update Available", "发现新版本") : l("Software Update", "软件更新")}
            </div>
            <div className="text-xs text-text-muted mt-0.5 whitespace-nowrap truncate">
              {updateAvailable && newVersion ? (
                <span className="font-semibold text-success">{l(`New version ${newVersion} is ready`, `新版本 ${newVersion} 已准备就绪`)}</span>
              ) : (
                l("Your software is up to date", "您的软件已是最新版本")
              )}
            </div>
          </div>
          <div className="flex w-full">
            {updateAvailable ? (
              <button
                onClick={performUpdate}
                className="flex flex-1 justify-center items-center gap-2 px-4 py-2 rounded-[12px] bg-success hover:bg-success/90 active:scale-[0.98] text-white text-xs font-extrabold shadow-md transition-all cursor-pointer whitespace-nowrap shrink-0"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m18 15-6-6-6 6" />
                </svg>
                {l("Install Update", "立即安装更新")}
              </button>
            ) : (
              <button
                onClick={() => triggerCheck(false)}
                disabled={checking}
                className="flex flex-1 justify-center items-center gap-2 px-4 py-2 rounded-[12px] bg-secondary hover:bg-secondary/90 active:scale-[0.98] text-white text-xs font-extrabold shadow-md transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
              >
                {checking ? (
                  <>
                    <div className="w-[15px] h-[15px] shrink-0 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    {l("Checking...", "正在检查...")}
                  </>
                ) : (
                  <>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                      <path d="M3 3v5h5" />
                      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                      <path d="M16 16h5v5" />
                    </svg>
                    {l("Check for Updates", "检查更新")}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
