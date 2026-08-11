import { useCallback, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Activity, ArrowUpDown, Check, Gauge } from "lucide-react"
import { useAlert } from "@/contexts/AlertContext"
import { useEngine } from "@/contexts/EngineContext"
import { useSubs } from "@/contexts/SubsContext"
import MobileTopBar, { topBarIconBtnClass } from "@/components/MobileTopBar"
import { flagEmojiForNodeName } from "@/lib/node-flag"
import { getAllNodeLatencies, setNodeLatency } from "@/lib/node-latency"
import { getNodeLatencyTone } from "@/lib/node-latency-tone"
import { testNodesTcpLatencyBatch } from "@/lib/node-speed-test"
import { cn } from "@/lib/utils"

type SortBy = "name" | "latency" | "protocol"

/** Latency map: undefined = unknown, 0 while testing, >0 ms, -1 timeout. */
type LatencyMap = Record<string, number | undefined>

function sortLabel(sortBy: SortBy): string {
  switch (sortBy) {
    case "latency":
      return "按延迟排序"
    case "protocol":
      return "按协议排序"
    default:
      return "按名称排序"
  }
}

function nextSort(sortBy: SortBy): SortBy {
  if (sortBy === "name") return "latency"
  if (sortBy === "latency") return "protocol"
  return "name"
}

export default function NodesPage() {
  const navigate = useNavigate()
  const { nodes, syncing } = useSubs()
  const { engine, selectNode } = useEngine()
  const { showError } = useAlert()
  const [sortBy, setSortBy] = useState<SortBy>("name")
  const [selecting, setSelecting] = useState(false)
  const [testing, setTesting] = useState(false)
  const [latencies, setLatencies] = useState<LatencyMap>(() => {
    const map: LatencyMap = {}
    for (const [tag, ms] of getAllNodeLatencies()) {
      map[tag] = ms
    }
    return map
  })

  const selectedTag = engine.selectedNode ?? ""
  const busy = engine.state === "starting" || engine.state === "stopping" || selecting

  const sortedNodes = useMemo(() => {
    return [...nodes].sort((a, b) => {
      if (sortBy === "latency") {
        const pa = latencies[a.tag]
        const pb = latencies[b.tag]
        // Measured ok first (low→high), then unknown, then timeout at end.
        const rank = (v: number | undefined) => {
          if (v === undefined || v === 0) return 1_000_000
          if (v < 0) return 2_000_000
          return v
        }
        const d = rank(pa) - rank(pb)
        if (d !== 0) return d
        return a.name.localeCompare(b.name, "zh-CN")
      }
      if (sortBy === "protocol") {
        return (
          a.protocol.localeCompare(b.protocol, "zh-CN") ||
          a.name.localeCompare(b.name, "zh-CN")
        )
      }
      return a.name.localeCompare(b.name, "zh-CN")
    })
  }, [nodes, sortBy, latencies])

  const handleSelect = async (tag: string) => {
    if (busy || testing || tag === selectedTag) return
    setSelecting(true)
    try {
      await selectNode(tag)
    } finally {
      setSelecting(false)
    }
  }

  const handleSpeedTest = useCallback(async () => {
    if (testing || nodes.length === 0) return
    const targets = nodes.filter((n) => n.server && n.port)
    if (targets.length === 0) {
      showError("当前节点缺少服务器地址，无法测速", "无法测速")
      return
    }

    setTesting(true)
    // Clear display to "testing" state for all listed nodes.
    setLatencies((prev) => {
      const next: LatencyMap = { ...prev }
      for (const n of nodes) next[n.tag] = 0
      return next
    })

    try {
      await testNodesTcpLatencyBatch(
        targets.map((n) => ({
          tag: n.tag,
          server: n.server ?? "",
          port: n.port ?? 0,
        })),
        (tag, ms) => {
          setNodeLatency(tag, ms)
          setLatencies((prev) => ({ ...prev, [tag]: ms }))
        },
      )
      // After a full run, switch to latency sort so results are easy to scan.
      setSortBy("latency")
    } catch {
      showError("测速过程中出现错误，请重试", "测速失败")
    } finally {
      setTesting(false)
    }
  }, [testing, nodes, showError])

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-white animate-fade-in dark:bg-background">
      <MobileTopBar
        onBack={() => navigate("/")}
        title="选择节点"
        right={
          <>
            <button
              type="button"
              onClick={() => void handleSpeedTest()}
              disabled={testing || nodes.length === 0 || busy}
              className={cn(topBarIconBtnClass, "disabled:opacity-50")}
              aria-label="延迟测速"
              title="延迟测速"
            >
              <Activity className={cn("size-[18px]", testing && "animate-pulse")} />
            </button>
            <button
              type="button"
              onClick={() => setSortBy((prev) => nextSort(prev))}
              className={cn(
                topBarIconBtnClass,
                sortBy !== "name" &&
                  "bg-[var(--auth-accent)]/10 text-[var(--auth-accent)] hover:bg-[var(--auth-accent)]/15 hover:text-[var(--auth-accent)]",
              )}
              aria-label="排序"
              title={`当前：${sortLabel(sortBy)} · 点击切换`}
            >
              {sortBy === "latency" ? (
                <Gauge className="size-[18px]" />
              ) : (
                <ArrowUpDown className="size-[18px]" />
              )}
            </button>
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-5 pb-8 pt-1">
        <div className="mb-2.5 flex items-center justify-between px-0.5">
          <p className="text-xs font-semibold text-[#9aa0a6]">
            {nodes.length > 0 ? `${nodes.length} 个节点` : "节点列表"}
          </p>
          <p className="text-[11px] font-medium text-[#b0b8c4]">
            {testing ? "测速中…" : syncing ? "同步中…" : sortLabel(sortBy)}
          </p>
        </div>

        {sortedNodes.length > 0 ? (
          <section className="flex flex-col gap-3">
            {sortedNodes.map((node) => {
              const isSelected = selectedTag === node.tag
              const ping = latencies[node.tag]
              return (
                <button
                  type="button"
                  key={node.tag}
                  disabled={busy || testing}
                  onClick={() => void handleSelect(node.tag)}
                  className={cn(
                    "flex h-16 w-full items-center gap-3 rounded-[1.15rem] px-4 text-left transition-colors",
                    "disabled:cursor-wait disabled:opacity-70",
                    isSelected
                      ? "bg-[var(--auth-accent)]/10 ring-1 ring-[var(--auth-accent)]/30 dark:bg-[var(--auth-accent)]/15"
                      : "bg-[#f1f2f4] hover:bg-[#e8eaed] dark:bg-muted dark:hover:bg-muted/80",
                  )}
                >
                  <span
                    className="w-8 shrink-0 text-center text-2xl leading-none select-none"
                    aria-hidden
                  >
                    {flagEmojiForNodeName(node.name)}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "truncate text-[15px] font-semibold tracking-tight",
                        "text-[#1a1d21] dark:text-foreground",
                      )}
                      title={node.name}
                    >
                      {node.name}
                    </p>
                    {node.server ? (
                      <p className="mt-0.5 truncate text-[11px] font-medium text-[#9aa0a6]">
                        {node.server}
                      </p>
                    ) : null}
                  </div>

                  {/* Fixed-width slot so latency always occupies the same place */}
                  <span className="flex w-[3.75rem] shrink-0 items-center justify-end gap-1 font-mono text-xs font-bold tabular-nums">
                    <LatencyBadge testing={testing} ping={ping} />
                  </span>

                  <div
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full transition-all",
                      isSelected
                        ? "bg-[var(--auth-accent)] text-white shadow-[0_1px_3px_rgba(108,92,255,0.35)]"
                        : "bg-transparent",
                    )}
                    aria-hidden
                  >
                    {isSelected ? <Check className="size-3 stroke-[3]" /> : null}
                  </div>
                </button>
              )
            })}
          </section>
        ) : (
          <section className="flex flex-col items-center justify-center rounded-[1.25rem] bg-[#f1f2f4] px-6 py-16 dark:bg-muted">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-white text-[#b0b8c4] shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:bg-card">
              <Activity className="size-5" />
            </div>
            <p className="mt-4 text-sm font-semibold text-[#6b7280]">
              {syncing ? "订阅同步中" : "暂无节点"}
            </p>
            <p className="mt-1 text-center text-xs font-medium text-[#9aa0a6]">
              {syncing ? "请稍候，节点列表即将出现" : "订阅同步后将显示可用节点"}
            </p>
          </section>
        )}
      </div>
    </div>
  )
}

function LatencyBadge({
  testing,
  ping,
}: {
  testing: boolean
  ping: number | undefined
}) {
  // Always render a single-line placeholder so the column width stays stable.
  if (testing && (ping === undefined || ping === 0)) {
    return <span className="animate-pulse text-[#9aa0a6]">-- ms</span>
  }
  if (ping === undefined || ping === 0) {
    return <span className="text-[#b0b8c4]">-- ms</span>
  }
  if (ping < 0) {
    return <span className="text-destructive">超时</span>
  }
  const tone = getNodeLatencyTone(ping)
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("size-1.5 shrink-0 rounded-full", tone.dot)} />
      <span className={tone.text}>{ping}ms</span>
    </span>
  )
}
