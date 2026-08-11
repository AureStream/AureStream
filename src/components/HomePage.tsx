import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useEngine } from "@/contexts/EngineContext"
import { useSubs } from "@/contexts/SubsContext"
import MobileTopBar, { topBarIconBtnClass } from "@/components/MobileTopBar"
import { Switch } from "@/components/ui/switch"
import { flagEmojiForNodeName } from "@/lib/node-flag"
import {
  loadProxyPrefs,
  setEnableTunPref,
  setSmartRoutingPref,
} from "@/lib/proxy-prefs"
import { cn } from "@/lib/utils"

const PrefIcons = {
  Activity: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  Globe: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20" />
      <path d="M2 12h20" />
    </svg>
  ),
  Ipv6: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7h4v10H4zM10 7h2l3 10h-2.2l-.5-1.8H11l-.5 1.8H8.3L11.3 7zM18 7h2v10h-2z" />
      <path d="M11.3 13.2h2.4" />
    </svg>
  ),
}

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

function formatDuration(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const hh = String(Math.floor(s / 3600)).padStart(2, "0")
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0")
  const ss = String(s % 60).padStart(2, "0")
  return `${hh}:${mm}:${ss}`
}

/** Live HH:MM:SS while connected; resets on disconnect. */
function useConnectionDuration(connected: boolean) {
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (connected) {
      setStartedAt(Date.now())
      setNow(Date.now())
      const id = window.setInterval(() => setNow(Date.now()), 1000)
      return () => window.clearInterval(id)
    }
    setStartedAt(null)
  }, [connected])

  if (!connected || startedAt == null) return 0
  return Math.max(0, Math.floor((now - startedAt) / 1000))
}

export default function HomePage() {
  const navigate = useNavigate()
  const { nodes, subscriptions, activeId, syncing } = useSubs()
  const { engine, start, stop } = useEngine()

  const [smartRouting, setSmartRouting] = useState(true)
  const [enableTun, setEnableTun] = useState(false)
  // IPv6 not wired yet — keep visible but disabled off.
  const enableIpv6 = false

  useEffect(() => {
    const prefs = loadProxyPrefs()
    setSmartRouting(prefs.smartRouting)
    setEnableTun(prefs.enableTun)
  }, [])

  // Reflect engine capture mode when running (tray may have switched).
  useEffect(() => {
    if (engine.state !== "running") return
    if (engine.captureMode === "tun") setEnableTun(true)
    if (engine.captureMode === "system") setEnableTun(false)
  }, [engine.state, engine.captureMode])

  const busy = engine.state === "starting" || engine.state === "stopping"
  const connected = engine.state === "running"
  const failed = engine.state === "failed"
  const nodesEmpty = nodes.length === 0
  const prefsDisabled = busy
  /** Only after a successful connection; otherwise show preference switches. */
  const showNodeEntry = connected
  const durationText = formatDuration(useConnectionDuration(connected))

  const selected =
    nodes.find((n) => n.tag === engine.selectedNode) ??
    (engine.selectedNode
      ? { tag: engine.selectedNode, name: engine.selectedNode, protocol: "" }
      : null) ??
    (nodes.length > 0 ? nodes[0] : null)

  const nodeTitle = selected?.name
    ?? (nodesEmpty
      ? syncing
        ? "订阅同步中"
        : "暂无节点"
      : "未选择节点")

  const sub =
    (activeId && subscriptions.find((s) => s.id === activeId)) || subscriptions[0] || null
  const hasSub = Boolean(sub)
  const trafficTotal = hasSub && sub!.trafficTotal > 1 ? sub!.trafficTotal : ONE_TB
  const trafficUsed = hasSub ? sub!.trafficUsed : 0
  const remainingBytes = Math.max(0, trafficTotal - trafficUsed)
  const usedGB = hasSub ? (trafficUsed / ONE_GB).toFixed(2) : "--"
  const remainingGB = hasSub ? (remainingBytes / ONE_GB).toFixed(2) : "--"
  const expireText = hasSub ? formatDate(sub!.expireTime) : "--"
  const remainingPercent =
    hasSub && trafficTotal > 0
      ? Math.min(100, (remainingBytes / trafficTotal) * 100)
      : 0

  const statusLine = (() => {
    if (connected) return { kind: "on" as const, text: durationText }
    if (busy && engine.state === "starting") return { kind: "busy" as const, text: "正在连接…" }
    if (busy && engine.state === "stopping") return { kind: "busy" as const, text: "正在断开…" }
    // Detail is shown via global error dialog; keep status line short.
    if (failed) return { kind: "fail" as const, text: "连接失败" }
    return { kind: "off" as const, text: "点击按钮进行连接" }
  })()

  const canToggle = !busy && (connected || !nodesEmpty)

  const handleToggle = () => {
    if (connected) {
      void stop()
      return
    }
    // Mutual exclusion: TUN vs system proxy.
    const mode = enableTun ? "tun" : "system"
    void start({
      mode,
      smartRouting,
      nodeTag: selected?.tag,
    })
  }

  const handleToggleTun = (next: boolean) => {
    setEnableTun(next)
    setEnableTunPref(next)
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-white animate-fade-in dark:bg-background">
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

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 pb-3 pt-0">
        {/* Traffic card */}
        <section className="shrink-0 rounded-[1.15rem] bg-[#f1f2f4] px-4 py-3.5 dark:bg-muted">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-[#6b7280]">使用流量</p>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-[1.5rem] font-bold tracking-tight text-[#1a1d21] tabular-nums dark:text-foreground">
                  {usedGB}
                </span>
                <span className="text-xs font-semibold text-[#9aa0a6]">GB</span>
              </div>
              <p className="mt-1 text-[11px] font-medium leading-snug text-[#9aa0a6]">
                到期时间 {expireText}
              </p>
            </div>

            <div className="relative h-[4.75rem] w-[7.25rem] shrink-0">
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
              {/* Label + value stay inside the semicircle under the arc */}
              <div className="pointer-events-none absolute inset-x-[10%] bottom-[4px] flex flex-col items-center">
                <span className="text-[10px] font-semibold leading-none text-[#6b7280]">
                  剩余流量
                </span>
                <div className="mt-1 flex items-baseline gap-0.5 leading-none">
                  <span className="text-[13px] font-bold tabular-nums text-[#1a1d21] dark:text-foreground">
                    {remainingGB}
                  </span>
                  <span className="text-[9px] font-semibold text-[#9aa0a6]">GB</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Connection band — vertically centered between traffic card and bottom node/prefs */}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
          <section className="flex shrink-0 flex-col items-center gap-4 py-1">
            <div className="flex h-7 items-center justify-center">
              {statusLine.kind === "on" ? (
                <div
                  className="inline-flex items-center gap-2 text-base font-semibold tabular-nums tracking-wide text-[var(--auth-accent)]"
                  aria-live="polite"
                  aria-label={`已连接 ${statusLine.text}`}
                >
                  <span className="size-2 rounded-full bg-[var(--auth-accent)]" />
                  <span>{statusLine.text}</span>
                </div>
              ) : statusLine.kind === "busy" ? (
                <div className="inline-flex items-center gap-2 text-sm font-medium text-[#8b93a0]">
                  <span className="size-2 animate-pulse rounded-full bg-[var(--auth-accent)]" />
                  <span>{statusLine.text}</span>
                </div>
              ) : statusLine.kind === "fail" ? (
                <div className="inline-flex max-w-[280px] items-center gap-2 text-center text-sm font-medium text-destructive">
                  <span className="size-2 shrink-0 rounded-full bg-destructive" />
                  <span className="line-clamp-2">{statusLine.text}</span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-2 text-sm font-medium text-[#8b93a0]">
                  <span className="size-2 rounded-full bg-[#c5ccd6]" />
                  <span>{statusLine.text}</span>
                </div>
              )}
            </div>

            <div className="relative flex items-center justify-center">
              {/* Equal ring gaps: outer 10.75 → middle 8.75 → inner 6.75 (1rem each side) */}
              {/* Outer ring — stays neutral; only the middle band picks up connect color */}
              <div className="relative flex h-[10.75rem] w-[10.75rem] items-center justify-center rounded-full border-[1.5px] border-[#e6ebf2] bg-transparent">
                <div
                  className={cn(
                    "flex h-[8.75rem] w-[8.75rem] items-center justify-center rounded-full border-[1.5px] transition-colors duration-300",
                    connected
                      ? // Same solid accent for border + fill (no lighter tinted wash)
                        "border-[var(--auth-accent)] bg-[var(--auth-accent)]"
                      : "border-[#e8edf4] bg-transparent",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => void handleToggle()}
                    disabled={!canToggle}
                    aria-label={connected ? "断开连接" : "连接"}
                    className={cn(
                      "relative flex h-[6.75rem] w-[6.75rem] items-center justify-center rounded-full border border-[#e8edf4] bg-white text-[#a0aab8] transition-all duration-300",
                      "hover:text-[#7a8494]",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--auth-accent)]/35",
                      "disabled:cursor-not-allowed disabled:opacity-50",
                      "active:scale-[0.97]",
                      busy && !connected && "animate-pulse",
                    )}
                  >
                    <svg
                      width="42"
                      height="42"
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

            <div className="flex h-5 items-center justify-center gap-1.5 text-xs font-medium text-[#8b93a0]">
              <svg
                width="14"
                height="14"
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
        </div>

        {/* Bottom: node (connected) / prefs (idle) + version */}
        <div className="mx-auto flex w-full max-w-[300px] shrink-0 flex-col gap-8 px-1 pb-3 pt-1">
          <div className="flex h-[4.25rem] w-full items-center justify-center">
            {showNodeEntry ? (
              <button
                type="button"
                onClick={() => navigate("/nodes")}
                aria-label={`当前节点 ${nodeTitle}，点击选择节点`}
                className={cn(
                  "flex h-[3.75rem] w-full items-center gap-3 rounded-[1.15rem] border px-3.5 text-left transition-colors",
                  "border-[var(--auth-accent)]/25 bg-[var(--auth-accent)]/8",
                  "hover:bg-[var(--auth-accent)]/12 active:scale-[0.99]",
                  "dark:border-[var(--auth-accent)]/30 dark:bg-[var(--auth-accent)]/10",
                )}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white text-lg leading-none shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:bg-card" aria-hidden>
                  {flagEmojiForNodeName(nodeTitle)}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-[15px] font-semibold text-[#1a1d21] dark:text-foreground"
                    title={nodeTitle}
                  >
                    {nodeTitle}
                  </p>
                  <p className="mt-0.5 text-[11px] font-medium text-[#9aa0a6]">点击切换</p>
                </div>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.25"
                  className="shrink-0 text-[var(--auth-accent)]"
                  aria-hidden
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            ) : (
              <div className="grid h-full w-full max-w-[300px] grid-cols-3 content-center gap-1">
                <label className="flex min-w-0 cursor-pointer select-none flex-col items-center justify-center gap-1.5 px-0.5">
                  <span className="flex min-w-0 items-center justify-center gap-1 text-[11px] font-semibold leading-tight text-[#6b7280]">
                    <span className="shrink-0 text-[var(--auth-accent)]">
                      <PrefIcons.Activity />
                    </span>
                    <span className="truncate">智能分流</span>
                  </span>
                  <Switch
                    size="sm"
                    checked={smartRouting}
                    disabled={prefsDisabled}
                    onCheckedChange={(v) => {
                      setSmartRouting(v)
                      setSmartRoutingPref(v)
                    }}
                    aria-label="智能分流"
                  />
                </label>

                <label className="flex min-w-0 cursor-pointer select-none flex-col items-center justify-center gap-1.5 px-0.5">
                  <span className="flex min-w-0 items-center justify-center gap-1 text-[11px] font-semibold leading-tight text-[#6b7280]">
                    <span className="shrink-0 text-[var(--auth-accent)]">
                      <PrefIcons.Globe />
                    </span>
                    <span className="truncate">虚拟网卡</span>
                  </span>
                  <Switch
                    size="sm"
                    checked={enableTun}
                    disabled={prefsDisabled}
                    onCheckedChange={handleToggleTun}
                    aria-label="虚拟网卡"
                  />
                </label>

                <label className="flex min-w-0 cursor-not-allowed select-none flex-col items-center justify-center gap-1.5 px-0.5 opacity-45">
                  <span className="flex min-w-0 items-center justify-center gap-1 text-[11px] font-semibold leading-tight text-[#6b7280]">
                    <span className="shrink-0 text-[var(--auth-accent)]">
                      <PrefIcons.Ipv6 />
                    </span>
                    <span className="truncate">IPv6</span>
                  </span>
                  <Switch
                    size="sm"
                    checked={enableIpv6}
                    disabled
                    aria-label="IPv6（暂不可用）"
                  />
                </label>
              </div>
            )}
          </div>

          <footer>
            <div className="mx-auto flex max-w-[220px] items-center gap-3">
              <div className="h-px flex-1 bg-[#eceef1]" />
              <div className="flex items-center gap-1.5">
                <img
                  src="/logo.png"
                  alt=""
                  className="size-3.5 rounded-[4px] object-cover opacity-80"
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
    </div>
  )
}
