import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { openUrl } from "@tauri-apps/plugin-opener"
import { type as getOsType } from "@tauri-apps/plugin-os"
import {
  Activity,
  Github,
  Monitor,
  Shield,
  Zap,
} from "lucide-react"
import { useUpdate } from "../contexts/UpdateContext"
import { GITHUB_URL, XRAY_VERSION } from "../types/definition"
import MobileTopBar from "./MobileTopBar"
import { cn } from "@/lib/utils"

const XRAY_DOCS_URL = "https://xtls.github.io"

const FEATURES = [
  { title: "安全隧道", desc: "加密传输", icon: Shield },
  { title: "智能分流", desc: "境内外路由", icon: Activity },
  { title: "低延迟", desc: "稳定连接", icon: Zap },
  { title: "多平台", desc: "Mac / Win / Linux", icon: Monitor },
] as const

export default function AboutPage() {
  const navigate = useNavigate()
  const { currentVersion } = useUpdate()
  const [osType, setOsType] = useState("Desktop")

  useEffect(() => {
    try {
      const t = getOsType()
      setOsType(t === "macos" ? "macOS" : t === "windows" ? "Windows" : "Linux")
    } catch {
      setOsType("Desktop")
    }
  }, [])

  const versionLabel = currentVersion ? `v${currentVersion}` : "…"
  const year = new Date().getFullYear()

  const meta = [
    { label: "应用", value: versionLabel },
    { label: "内核", value: XRAY_VERSION },
    { label: "平台", value: osType },
  ]

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden animate-fade-in">
      <div className="relative z-10 shrink-0">
        <MobileTopBar onBack={() => navigate("/dashboard")} title="关于" />
      </div>

      {/* One-screen flat stack */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col px-5 pb-6 pt-2">
        <div className="mx-auto flex w-full max-w-[340px] min-h-0 flex-1 flex-col justify-between">
          {/* Brand */}
          <section className="flex shrink-0 flex-col items-center pt-4 text-center">
            <div className="mb-4 flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-[1.35rem] bg-primary text-primary-foreground shadow-md shadow-primary/25">
              <Shield className="size-8" strokeWidth={2.1} />
            </div>
            <h1 className="text-[1.65rem] font-black tracking-tight text-foreground">
              AureStream
            </h1>
            <p className="mt-1.5 max-w-[16rem] text-sm font-medium text-muted-foreground">
              轻量桌面网络隧道，聚焦智能分流与高速连接
            </p>
          </section>

          {/* Middle block */}
          <div className="flex min-h-0 flex-col justify-center gap-4 py-3">
            {/* Version strip */}
            <div className="grid grid-cols-3 overflow-hidden rounded-2xl border border-border bg-card">
              {meta.map((item, i) => (
                <div
                  key={item.label}
                  className={cn(
                    "flex flex-col items-center justify-center gap-0.5 px-2 py-3",
                    i > 0 && "border-l border-border",
                  )}
                >
                  <span className="text-[11px] font-medium text-muted-foreground">{item.label}</span>
                  <span className="max-w-full truncate text-xs font-bold tabular-nums text-foreground">
                    {item.value}
                  </span>
                </div>
              ))}
            </div>

            {/* Features — flat 2×2 */}
            <div className="grid grid-cols-2 gap-2.5">
              {FEATURES.map((f) => {
                const Icon = f.icon
                return (
                  <div
                    key={f.title}
                    className="flex items-center gap-2.5 rounded-2xl border border-border bg-card px-3 py-3"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="size-4" strokeWidth={2.2} />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-foreground">{f.title}</div>
                      <div className="truncate text-[11px] font-medium text-muted-foreground">
                        {f.desc}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Actions + footer */}
          <section className="shrink-0 space-y-3">
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => void openUrl(GITHUB_URL)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-foreground text-sm font-bold text-background transition-transform active:scale-[0.98]"
              >
                <Github className="size-4" />
                GitHub
              </button>
              <button
                type="button"
                onClick={() => void openUrl(XRAY_DOCS_URL)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border bg-card text-sm font-bold text-foreground transition-transform active:scale-[0.98]"
              >
                内核文档
              </button>
            </div>
            <p className="text-center text-xs text-muted-foreground">
              © {year} AureStream · MIT License
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
