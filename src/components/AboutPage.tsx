import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { useUpdate } from "../contexts/UpdateContext"
import { openUrl } from "@tauri-apps/plugin-opener"
import { SING_BOX_VERSION } from "../types/definition"
import { type as getOsType } from "@tauri-apps/plugin-os"
import { useState, useEffect } from "react"
import MobileTopBar from "./MobileTopBar"

export default function AboutPage() {
  const { i18n } = useTranslation()
  const l = (en: string, zh: string) => (i18n.language.startsWith("zh") ? zh : en)
  const { currentVersion } = useUpdate()
  const navigate = useNavigate()

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
    <div className="flex flex-col w-full h-full max-w-[420px] mx-auto animate-fade-in">
      <MobileTopBar onBack={() => navigate("/dashboard")} title={l("About", "关于")} />

      <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-5 flex flex-col gap-4">
        {/* App info card */}
        <div className="glass-card rounded-[24px] p-5 shadow-glass flex flex-col gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-secondary to-purple-500 flex items-center justify-center shrink-0 text-white font-extrabold text-xl shadow-inner">
              A
            </div>
            <div className="min-w-0">
              <div className="font-bold text-text text-base truncate">AureStream {osType}</div>
              <div className="text-xs text-text-muted mt-0.5">
                {l("Version", "版本号")} <span className="font-mono font-bold text-text ml-0.5">{currentVersion || "..."}</span>
              </div>
            </div>
          </div>

          <div className="h-[1px] w-full bg-border-glass/30" />

          {/* Core engine */}
          <div className="flex items-center justify-between">
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

          <button
            onClick={() => openUrl("https://github.com/BadKid90s/AureStream")}
            className="w-full py-2.5 rounded-xl bg-secondary/10 hover:bg-secondary/20 text-secondary text-xs font-bold transition-colors cursor-pointer"
          >
            GitHub
          </button>
        </div>

        <p className="text-center text-[11px] text-text-muted px-6 leading-relaxed">
          {l("A simple proxy client built on sing-box.", "基于 sing-box 的简洁代理客户端。")}
        </p>
      </div>
    </div>
  )
}