import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Activity, ArrowUpDown, Check } from "lucide-react"
import { useEngine } from "@/contexts/EngineContext"
import { useSubs } from "@/contexts/SubsContext"
import MobileTopBar, { topBarIconBtnClass } from "@/components/MobileTopBar"
import { cn } from "@/lib/utils"

export default function NodesPage() {
  const navigate = useNavigate()
  const { nodes, syncing } = useSubs()
  const { engine, selectNode } = useEngine()
  const [sortBy, setSortBy] = useState<"name" | "protocol">("name")
  const [selecting, setSelecting] = useState(false)

  const selectedTag = engine.selectedNode ?? ""
  const busy = engine.state === "starting" || engine.state === "stopping" || selecting

  const sortedNodes = useMemo(() => {
    return [...nodes].sort((a, b) => {
      if (sortBy === "protocol") {
        return a.protocol.localeCompare(b.protocol, "zh-CN") || a.name.localeCompare(b.name, "zh-CN")
      }
      return a.name.localeCompare(b.name, "zh-CN")
    })
  }, [nodes, sortBy])

  const handleSelect = async (tag: string) => {
    if (busy || tag === selectedTag) return
    setSelecting(true)
    try {
      await selectNode(tag)
    } finally {
      setSelecting(false)
    }
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-white animate-fade-in dark:bg-background">
      <MobileTopBar
        onBack={() => navigate("/")}
        title="选择节点"
        right={
          <button
            type="button"
            onClick={() => setSortBy((prev) => (prev === "name" ? "protocol" : "name"))}
            className={cn(
              topBarIconBtnClass,
              sortBy === "protocol" &&
                "bg-[var(--auth-accent)]/10 text-[var(--auth-accent)] hover:bg-[var(--auth-accent)]/15 hover:text-[var(--auth-accent)]",
            )}
            aria-label="排序"
            title={sortBy === "protocol" ? "当前：协议排序" : "当前：名称排序"}
          >
            <ArrowUpDown className="size-[18px]" />
          </button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-5 pb-8 pt-1">
        <div className="mb-2.5 flex items-center justify-between px-0.5">
          <p className="text-xs font-semibold text-[#9aa0a6]">
            {nodes.length > 0 ? `${nodes.length} 个节点` : "节点列表"}
          </p>
          <p className="text-[11px] font-medium text-[#b0b8c4]">
            {syncing
              ? "同步中…"
              : sortBy === "protocol"
                ? "按协议排序"
                : "按名称排序"}
          </p>
        </div>

        {sortedNodes.length > 0 ? (
          <section className="flex flex-col gap-3">
            {sortedNodes.map((node) => {
              const isSelected = selectedTag === node.tag
              return (
                <button
                  type="button"
                  key={node.tag}
                  disabled={busy}
                  onClick={() => void handleSelect(node.tag)}
                  className={cn(
                    "flex h-16 w-full items-center gap-3 rounded-[1.15rem] px-4 text-left transition-colors",
                    "disabled:cursor-wait disabled:opacity-70",
                    isSelected
                      ? "bg-[var(--auth-accent)]/10 ring-1 ring-[var(--auth-accent)]/30 dark:bg-[var(--auth-accent)]/15"
                      : "bg-[#f1f2f4] hover:bg-[#e8eaed] dark:bg-muted dark:hover:bg-muted/80",
                  )}
                >
                  <span className="w-8 shrink-0 text-center text-2xl leading-none select-none" aria-hidden>
                    🌐
                  </span>

                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight",
                      "text-[#1a1d21] dark:text-foreground",
                    )}
                    title={node.name}
                  >
                    {node.name}
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
