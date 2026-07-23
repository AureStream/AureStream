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

  const meta = [
    { label: l("App", "应用"), value: `v${currentVersion || "..."}` },
    { label: l("Core", "内核"), value: `v${SING_BOX_VERSION}` },
    { label: l("Platform", "平台"), value: osType },
  ]

  return (
    <div className="relative flex h-full w-full flex-col animate-fade-in overflow-hidden bg-transparent">
      <div className="pointer-events-none absolute left-[-5rem] top-0 h-56 w-56 rounded-full bg-[#6C5CFF]/7 blur-3xl" />
      <div className="pointer-events-none absolute right-[-6rem] top-36 h-60 w-60 rounded-full bg-cyan-200/18 dark:bg-cyan-400/10 blur-3xl" />

      <div className="relative z-10 shrink-0">
        <MobileTopBar onBack={() => navigate("/dashboard")} title={l("About", "关于")} />
      </div>

      <div className="relative z-10 flex-1 min-h-0 overflow-hidden px-5 pb-4 pt-1 flex flex-col justify-between gap-4">

        <div className="relative flex flex-col items-center text-center shrink-0">
          {/* Poster hero */}
          <section className="flex flex-col items-center text-center">
            <div className="relative flex h-[5.2rem] w-full items-center justify-center">
              <div className="absolute h-24 w-24 rounded-full bg-[#6C5CFF]/16 blur-2xl" />
              <div className="absolute h-[4.8rem] w-[4.8rem] rounded-full border border-white/55 dark:border-white/10" />
              <div className="absolute h-[3.7rem] w-[3.7rem] rounded-full border border-[#6C5CFF]/15" />
              <div className="relative h-[4.25rem] w-[4.25rem] rounded-[1.45rem] bg-gradient-to-br from-[#6C5CFF] via-[#7C6CFF] to-[#A898FF] flex items-center justify-center shadow-2xl shadow-[#6C5CFF]/25 rotate-[-7deg]">
                <div className="absolute inset-[3px] rounded-[1.8rem] bg-white/10" />
                <svg className="relative rotate-[7deg]" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.15" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
            </div>

            <div className="inline-flex items-center justify-center gap-2 rounded-full bg-white/55 dark:bg-white/8 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#6C5CFF]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#6C5CFF]" />
              {l("Proxy Client", "代理客户端")}
            </div>
            <h1 className="mt-2 text-3xl font-black text-slate-950 dark:text-white tracking-tight text-center">AureStream</h1>
            <p className="mt-1.5 max-w-[300px] text-center text-xs text-slate-500 dark:text-slate-400 font-semibold leading-relaxed">
              {l(
                "A lightweight desktop tunnel with smart routing, built for clarity and speed.",
                "轻量桌面网络隧道，聚焦智能分流、清晰体验与高速连接。"
              )}
            </p>
          </section>
        </div>

        <div className="relative flex-1 min-h-0 flex flex-col justify-center gap-3.5">
          {/* Version rail */}
          <section className="grid grid-cols-3 gap-2">
            {meta.map((item) => (
              <div key={item.label} className="min-w-0 rounded-full bg-white/35 dark:bg-white/5 px-2 py-2 text-center backdrop-blur-sm">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{item.label}</div>
                <div className="mt-1 truncate text-xs font-black text-slate-900 dark:text-white tabular-nums">{item.value}</div>
              </div>
            ))}
          </section>

          {/* Capability chips */}
          <section className="relative min-h-[15.5rem] overflow-hidden flex flex-col items-center justify-center text-center px-2 py-4">
            <div className="pointer-events-none absolute inset-x-8 top-6 h-24 rounded-full bg-[#6C5CFF]/10 blur-3xl" />
            <div className="pointer-events-none absolute bottom-0 left-6 h-24 w-24 rounded-full bg-cyan-200/25 dark:bg-cyan-400/10 blur-2xl" />
            <div className="pointer-events-none absolute bottom-0 right-8 h-24 w-24 rounded-full bg-amber-100/50 dark:bg-amber-400/10 blur-2xl" />

            <div className="relative flex items-center justify-center">
              <div className="text-center">
                <div className="text-[11px] font-black uppercase tracking-[0.22em] text-[#6C5CFF]">
                  {l("Essentials", "核心体验")}
                </div>
                <h2 className="text-2xl font-black text-slate-950 dark:text-white mt-1">
                  {l("Secure. Fast. Clear.", "安全、快速、清晰。")}
                </h2>
                <p className="mt-1 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                  {l("Powered by sing-box core", "由 sing-box 内核驱动")}
                </p>
              </div>
            </div>

            <div className="relative mt-4 grid grid-cols-2 gap-2.5 w-full">
              {features.map((f, i) => (
                <div
                  key={i}
                  className={`min-h-[3.4rem] rounded-[22px] px-3 py-2 flex items-center justify-center gap-2 overflow-hidden text-center ${
                    i === 0
                      ? "bg-[#EFECFF]/70 dark:bg-[#6C5CFF]/14"
                      : i === 1
                        ? "bg-cyan-50/60 dark:bg-cyan-400/10"
                        : i === 2
                          ? "bg-amber-50/60 dark:bg-amber-400/10"
                          : "bg-white/35 dark:bg-white/5"
                  }`}
                >
                  <div className="w-7 h-7 rounded-full bg-white/70 dark:bg-white/10 text-[#6C5CFF] flex items-center justify-center shrink-0">
                    {f.icon}
                  </div>
                  <div className="text-xs font-black text-slate-900 dark:text-white leading-tight text-center">{f.title}</div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="relative flex flex-col gap-2.5 shrink-0">
          {/* Links */}
          <section className="px-1 py-1">
            <div className="text-center text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
              {l("Open source stack", "开源技术栈")}
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                onClick={() => openUrl("https://github.com/BadKid90s/AureStream")}
                className="flex items-center justify-center gap-2 rounded-full bg-slate-950 px-3 py-2.5 text-white transition-all cursor-pointer active:scale-[0.98]"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" className="shrink-0">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                <span className="text-xs font-black">GitHub</span>
              </button>

              <button
                onClick={() => openUrl("https://sing-box.sagernet.org")}
                className="flex items-center justify-center gap-2 rounded-full bg-[#EFECFF] dark:bg-[#6C5CFF]/16 px-3 py-2.5 text-[#6C5CFF] transition-all cursor-pointer active:scale-[0.98]"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/>
                  <line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/>
                  <line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/>
                  <line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/>
                  <line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>
                </svg>
                <span className="text-xs font-black">sing-box</span>
              </button>
            </div>
          </section>

          {/* Footer */}
          <div className="relative flex flex-col items-center justify-center gap-1 py-0.5 text-center">
            <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-400 font-semibold text-center">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
              {l("Made with love · MIT License", "用心制作 · MIT 许可证")}
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
