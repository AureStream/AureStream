import { type ReactElement } from "react"
import { cn } from "@/lib/utils"

export type ProxyMode = "rule" | "global" | "direct" | "tun"

interface ModeSelectorProps {
  mode: ProxyMode
  onChange: (mode: ProxyMode) => void
}

const RuleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
)
const GlobalIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20"/><path d="M2 12h20"/>
  </svg>
)
const DirectIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
  </svg>
)

const modes: { id: ProxyMode; label: string; desc: string; Icon: () => ReactElement }[] = [
  { id: "rule", label: "规则", desc: "按规则分流", Icon: RuleIcon },
  { id: "global", label: "全局", desc: "全部流量代理", Icon: GlobalIcon },
  { id: "direct", label: "直连", desc: "不走代理", Icon: DirectIcon },
]

export default function ModeSelector({ mode, onChange }: ModeSelectorProps) {
  return (
    <div className="flex items-center gap-1 p-1 bg-bg rounded-xl border border-border-light">
      {modes.map((m) => (
        <button
          key={m.id}
          onClick={() => onChange(m.id)}
          className={cn(
            "flex-1 flex flex-col items-center gap-0.5 py-2.5 px-3 rounded-lg cursor-pointer border-none font-[inherit] transition-all duration-200",
            mode === m.id
              ? "bg-white dark:bg-white/10 text-text dark:text-white shadow-sm scale-[1.02]"
              : "text-text-muted hover:text-text-secondary hover:bg-surface-active",
          )}
        >
          <span className="leading-none"><m.Icon /></span>
          <span className="text-[11px] font-semibold">{m.label}</span>
          <span className="text-[10px] opacity-60 leading-tight">{m.desc}</span>
        </button>
      ))}
    </div>
  )
}
