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

  const features = [
    {
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>,
      title: l("Secure Tunnel", "安全隧道"),
      desc: l("Military-grade encryption", "军用级加密保护"),
    },
    {
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
      title: l("Smart Routing", "智能分流"),
      desc: l("Rule-based routing", "基于规则的分流"),
    },
    {
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
      title: l("Low Latency", "低延迟"),
      desc: l("Blazing fast connections", "极速稳定连接"),
    },
    {
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>,
      title: l("Multi-platform", "多平台"),
      desc: l("Mac · Win · Linux", "Mac · Win · Linux"),
    },
  ]

  return (
    <div className="flex h-full w-full flex-col animate-fade-in overflow-hidden">
      <MobileTopBar onBack={() => navigate("/dashboard")} title={l("About", "关于")} />

      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-5 pb-5 pt-3 flex flex-col justify-between gap-6">
        <div className="flex flex-col gap-7">
          {/* Brand hero */}
          <section className="relative flex flex-col items-center text-center pt-3">
            <div className="absolute top-2 h-36 w-36 rounded-full bg-[#6C5CFF]/12 blur-3xl pointer-events-none" />
            <div className="relative w-20 h-20 rounded-[28px] bg-gradient-to-br from-[#6C5CFF] to-[#8B7CFF] flex items-center justify-center shadow-lg shadow-[#6C5CFF]/20">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <div className="relative mt-5">
              <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">AureStream</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 font-semibold mt-2 max-w-[280px] leading-relaxed">
                {l(
                  "A clean and powerful proxy client built on sing-box.",
                  "基于 sing-box 打造的简洁高效代理客户端。"
                )}
              </p>
            </div>
            <div className="relative flex flex-wrap items-center justify-center gap-2.5 mt-5">
              <span className="px-3.5 py-1.5 rounded-full bg-[#6C5CFF]/10 text-[#6C5CFF] text-xs font-black">
                v{currentVersion || "..."}
              </span>
              <span className="px-3.5 py-1.5 rounded-full bg-white/55 dark:bg-white/8 text-text-secondary text-xs font-bold">
                {osType}
              </span>
              <span className="px-3.5 py-1.5 rounded-full bg-white/55 dark:bg-white/8 text-text-secondary text-xs font-bold">
                sing-box {SING_BOX_VERSION}
              </span>
            </div>
          </section>

          {/* Feature summary */}
          <section className="flex flex-col gap-4">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.22em] text-[#6C5CFF]">
                {l("Highlights", "核心能力")}
              </div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white mt-1">
                {l("Fast, safe, and quiet.", "快速、安全、安静。")}
              </h2>
            </div>

            <div className="flex flex-col rounded-[28px] bg-white/45 dark:bg-white/5 overflow-hidden">
              {features.map((f, i) => (
                <div key={i} className="flex items-center gap-3.5 px-4 py-3.5 border-b border-slate-200/55 dark:border-white/8 last:border-b-0">
                  <div className="w-9 h-9 rounded-2xl bg-[#EFECFF] dark:bg-[#6C5CFF]/18 text-[#6C5CFF] flex items-center justify-center shrink-0">
                    {f.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-black text-slate-800 dark:text-white leading-tight">{f.title}</div>
                    <div className="text-xs text-slate-400 font-medium mt-0.5 leading-tight">{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Links */}
          <section className="flex flex-col gap-2.5">
            <button
              onClick={() => openUrl("https://github.com/BadKid90s/AureStream")}
              className="flex items-center gap-3.5 px-1 py-2.5 transition-colors cursor-pointer w-full text-left group"
            >
              <div className="w-11 h-11 rounded-[18px] bg-slate-900 dark:bg-white/10 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-white dark:text-slate-200">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-black text-slate-800 dark:text-white">GitHub</div>
                <div className="text-xs text-slate-400 font-medium">BadKid90s/AureStream</div>
              </div>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300 shrink-0"><polyline points="9 18 15 12 9 6"/></svg>
            </button>

            <button
              onClick={() => openUrl("https://sing-box.sagernet.org")}
              className="flex items-center gap-3.5 px-1 py-2.5 transition-colors cursor-pointer w-full text-left group"
            >
              <div className="w-11 h-11 rounded-[18px] bg-[#EFECFF] dark:bg-[#6C5CFF]/18 text-[#6C5CFF] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/>
                  <line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/>
                  <line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/>
                  <line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/>
                  <line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-black text-slate-800 dark:text-white">sing-box</div>
                <div className="text-xs text-slate-400 font-medium">Core Engine · {SING_BOX_VERSION}</div>
              </div>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300 shrink-0"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </section>
        </div>

        {/* Footer */}
        <div className="flex flex-col items-center gap-1 py-1">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-semibold">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
            {l("Made with love · MIT License", "用心制作 · MIT 许可证")}
          </div>
        </div>

      </div>
    </div>
  )
}
