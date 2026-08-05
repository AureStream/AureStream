import { useNavigate } from "react-router-dom"
import { useEngine } from "@/contexts/EngineContext"
import { useSubs } from "@/contexts/SubsContext"
import MobileTopBar, { topBarIconBtnClass } from "@/components/MobileTopBar"
import { cn } from "@/lib/utils"

const ONE_GB = 1024 * 1024 * 1024
const ONE_TB = 1024 * 1024 * 1024 * 1024

function formatDate(ts: number) {
  if (!ts || ts <= 0) return "--"
  const d = new Date(ts * 1000)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}年${m}月${day}日`
}

export default function HomePage() {
  const navigate = useNavigate()
  const { nodes, subscriptions, activeId, syncing } = useSubs()
  const { engine, start, stop } = useEngine()

  const busy = engine.state === "starting" || engine.state === "stopping"
  const connected = engine.state === "running"
  const failed = engine.state === "failed"
  const nodesEmpty = nodes.length === 0

  const selected =
    nodes.find((n) => n.tag === engine.selectedNode) ??
    (engine.selectedNode
      ? { tag: engine.selectedNode, name: engine.selectedNode, protocol: "" }
      : null)

  const sub =
    (activeId && subscriptions.find((s) => s.id === activeId)) || subscriptions[0] || null
  const hasSub = Boolean(sub)
  const trafficTotal = hasSub && sub!.trafficTotal > 1 ? sub!.trafficTotal : ONE_TB
  const trafficUsed = hasSub ? sub!.trafficUsed : 0
  const remainingBytes = Math.max(0, trafficTotal - trafficUsed)
  const remainingGB = hasSub ? (remainingBytes / ONE_GB).toFixed(4) : "--"
  const usedText = hasSub ? `${(trafficUsed / ONE_GB).toFixed(4)} GB` : "--"
  const totalGBText = hasSub ? `${(trafficTotal / ONE_GB).toFixed(2)} GB` : "--"
  const expireText = hasSub ? formatDate(sub!.expireTime) : "--"
  const remainingPercent =
    hasSub && trafficTotal > 0
      ? Math.min(100, (remainingBytes / trafficTotal) * 100)
      : 0

  const statusLine = (() => {
    if (connected) return { kind: "on" as const, text: "已连接" }
    if (busy && engine.state === "starting") return { kind: "busy" as const, text: "正在连接…" }
    if (busy && engine.state === "stopping") return { kind: "busy" as const, text: "正在断开…" }
    if (failed) return { kind: "fail" as const, text: engine.reason ? `连接失败：${engine.reason}` : "连接失败" }
    return { kind: "off" as const, text: "点击按钮进行连接" }
  })()

  const canToggle = !busy && (connected || !nodesEmpty)

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-white animate-fade-in dark:bg-background">
      <MobileTopBar
        right={
          <button
            type="button"
            onClick={() => navigate("/profile")}
            className={topBarIconBtnClass}
            aria-label="我的"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </button>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto no-scrollbar px-5 pb-2 pt-1">
        {/* Traffic card */}
        <section className="shrink-0 rounded-[1.25rem] bg-[#f1f2f4] px-5 py-3.5 dark:bg-muted">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[#6b7280]">剩余流量</p>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-[1.75rem] font-bold tracking-tight text-[#1a1d21] tabular-nums dark:text-foreground">
                  {remainingGB}
                </span>
                <span className="text-sm font-semibold text-[#9aa0a6]">GB</span>
              </div>
              <p className="mt-1 text-xs font-medium text-[#9aa0a6]">
                本月套餐共 {totalGBText}
              </p>
            </div>

            <div className="relative h-[4.75rem] w-28 shrink-0">
              <svg className="h-full w-full overflow-visible" viewBox="0 0 120 74" aria-hidden>
                <defs>
                  <linearGradient id="trafficGaugeGradient" x1="12" y1="62" x2="108" y2="14" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#b8aeff" />
                    <stop offset="55%" stopColor="#6c5cff" />
                    <stop offset="100%" stopColor="#5546e8" />
                  </linearGradient>
                </defs>
                <path
                  d="M 12 62 A 48 48 0 0 1 108 62"
                  fill="none"
                  stroke="#e5e7eb"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
                <path
                  d="M 12 62 A 48 48 0 0 1 108 62"
                  fill="none"
                  stroke="url(#trafficGaugeGradient)"
                  strokeWidth="5"
                  strokeLinecap="round"
                  pathLength="100"
                  strokeDasharray="100"
                  strokeDashoffset={100 - remainingPercent}
                />
              </svg>
              <div className="absolute inset-x-0 top-[40px] flex items-center justify-center">
                <span className="text-base font-bold tabular-nums text-[#1a1d21] dark:text-foreground">
                  {remainingPercent.toFixed(0)}%
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[#e5e7eb] pt-3 dark:border-border">
            <div>
              <p className="text-xs font-medium text-[#9aa0a6]">已使用</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-[#1a1d21] dark:text-foreground">
                {usedText}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-[#9aa0a6]">到期时间</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-[#1a1d21] dark:text-foreground">
                {expireText}
              </p>
            </div>
          </div>
        </section>

        {/* Connection */}
        <section className="flex shrink-0 flex-col items-center pt-5 pb-3">
          <div className="mb-5 flex min-h-[32px] items-center justify-center">
            {statusLine.kind === "on" ? (
              <div className="inline-flex items-center gap-2.5 text-xl font-semibold text-[var(--auth-accent)]">
                <span className="size-2.5 rounded-full bg-[var(--auth-accent)]" />
                <span>{statusLine.text}</span>
              </div>
            ) : statusLine.kind === "busy" ? (
              <div className="inline-flex items-center gap-2 text-lg font-medium text-[#8b93a0]">
                <span className="size-2.5 animate-pulse rounded-full bg-[var(--auth-accent)]" />
                <span>{statusLine.text}</span>
              </div>
            ) : statusLine.kind === "fail" ? (
              <div className="inline-flex max-w-[280px] items-center gap-2 text-center text-sm font-medium text-destructive">
                <span className="size-2.5 shrink-0 rounded-full bg-destructive" />
                <span className="line-clamp-2">{statusLine.text}</span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 text-lg font-medium text-[#8b93a0]">
                <span className="size-2.5 rounded-full bg-[#c5ccd6]" />
                <span>{statusLine.text}</span>
              </div>
            )}
          </div>

          <div className="relative flex items-center justify-center">
            <div
              className={cn(
                "relative flex h-[14rem] w-[14rem] items-center justify-center rounded-full border transition-colors duration-300",
                connected
                  ? "border-[var(--auth-accent)]/40 bg-[var(--auth-accent)]/12"
                  : "border-[#e6ebf2] bg-transparent",
              )}
            >
              <div
                className={cn(
                  "flex h-[10.75rem] w-[10.75rem] items-center justify-center rounded-full border transition-colors duration-300",
                  connected
                    ? "border-[var(--auth-accent)]/35 bg-[var(--auth-accent)]/10"
                    : "border-[#e8edf4] bg-transparent",
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (connected) void stop()
                    else void start()
                  }}
                  disabled={!canToggle}
                  aria-label={connected ? "断开连接" : "连接"}
                  className={cn(
                    "relative flex h-[7.25rem] w-[7.25rem] items-center justify-center rounded-full border border-[#e8edf4] bg-white text-[#a0aab8] transition-all duration-300",
                    "hover:text-[#7a8494]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--auth-accent)]/35",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    "active:scale-[0.97]",
                    busy && !connected && "animate-pulse",
                  )}
                >
                  <svg
                    width="52"
                    height="52"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.15"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                    <line x1="12" y1="2" x2="12" y2="12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-center gap-1.5 text-sm font-medium text-[#8b93a0]">
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={cn(connected ? "text-[var(--auth-accent)]" : "text-[#b0b8c4]")}
              aria-hidden
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              {connected ? <path d="m9 12 2 2 4-4" /> : null}
            </svg>
            <span>
              {connected
                ? "数据隧道保护已启用"
                : nodesEmpty
                  ? syncing
                    ? "订阅同步中…"
                    : "暂无可用节点"
                  : "数据隧道保护未启用"}
            </span>
          </div>
        </section>

        {/* Node / bottom slot */}
        <div className="mx-auto mt-16 flex w-full max-w-[340px] shrink-0 flex-col">
          <section className="flex h-[4.75rem] w-full items-center justify-center px-1.5">
            <button
              type="button"
              onClick={() => navigate("/nodes")}
              className="flex h-full w-full max-w-[300px] items-center gap-3 rounded-[1.25rem] border border-[#eceef1] bg-white px-4 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:bg-[#fafafa] dark:border-border dark:bg-card dark:hover:bg-muted/40"
            >
              <span className="text-2xl leading-none select-none" aria-hidden>
                🌐
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-[#1a1d21] dark:text-foreground">
                  {selected
                    ? selected.name
                    : nodesEmpty
                      ? syncing
                        ? "订阅同步中"
                        : "暂无节点"
                      : "选择节点"}
                </p>
                <div className="mt-0.5 flex items-center justify-between text-xs font-medium text-[#9aa0a6]">
                  <span className="font-mono uppercase">
                    {selected?.protocol || "系统代理"}
                  </span>
                  <span className="font-mono">{nodes.length > 0 ? `${nodes.length}` : "--"}</span>
                </div>
              </div>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.25"
                className="shrink-0 text-[#9aa0a6]"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </section>
        </div>

        <div className="min-h-1 flex-1" aria-hidden />
        <footer className="mx-auto w-full max-w-[340px] shrink-0 pb-0 pt-0.5">
          <div className="mx-auto flex max-w-[220px] items-center gap-3">
            <div className="h-px flex-1 bg-[#eceef1]" />
            <div className="flex items-center gap-1.5">
              <img
                src="/logo.png"
                alt=""
                className="size-4 rounded-[4px] object-cover opacity-80"
                draggable={false}
              />
              <span className="text-[11px] font-medium tracking-wide text-[#9aa0a6]">
                AureStream
              </span>
              <span className="text-[11px] text-[#d0d4da]">·</span>
              <span className="text-[11px] font-medium tabular-nums text-[#b0b8c4]">v0.3.5</span>
            </div>
            <div className="h-px flex-1 bg-[#eceef1]" />
          </div>
        </footer>
      </div>
    </div>
  )
}
