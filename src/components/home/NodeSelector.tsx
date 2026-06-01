import { useState, useEffect, useMemo } from "react"
import { ArrowDownUpIcon, ActivityIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { badge, btn, type } from "@/lib/typography"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardTitle } from "@/components/ui/card"
import { useSubscriptions } from "@/hooks/useSubscriptions"
import { useEngineState } from "@/hooks/useEngineState"
import { fetchSelectGroup, selectProxyNode, pingNodeTcp } from "@/utils/clash-api"
import { getStoreValue, setStoreValue } from "@/single/store"

const SELECTED_NODE_KEY = "selected_node_tag"

function getFlagEmoji(name: string): string {
  const n = name.toUpperCase()
  if (n.includes("HK") || n.includes("香港") || n.includes("HONG")) return "🇭🇰"
  if (n.includes("JP") || n.includes("日本") || n.includes("JAPAN")) return "🇯🇵"
  if (n.includes("US") || n.includes("美国") || n.includes("UNITED STATES") || n.includes("USA")) return "🇺🇸"
  if (n.includes("SG") || n.includes("新加坡") || n.includes("SINGAPORE")) return "🇸🇬"
  if (n.includes("TW") || n.includes("台湾") || n.includes("TAIWAN")) return "🇹🇼"
  if (n.includes("KR") || n.includes("韩国") || n.includes("KOREA")) return "🇰🇷"
  if (n.includes("CN") || n.includes("中国") || n.includes("CHINA")) return "🇨🇳"
  if (n.includes("UK") || n.includes("英国") || n.includes("UNITED KINGDOM") || n.includes("GB")) return "🇬🇧"
  if (n.includes("DE") || n.includes("德国") || n.includes("GERMANY")) return "🇩🇪"
  if (n.includes("FR") || n.includes("法国") || n.includes("FRANCE")) return "🇫🇷"
  if (n.includes("CA") || n.includes("加拿大") || n.includes("CANADA")) return "🇨🇦"
  if (n.includes("RU") || n.includes("俄罗斯") || n.includes("RUSSIA")) return "🇷🇺"
  return "🌐"
}

export function NodeSelector() {
  const { nodes, loading: subLoading } = useSubscriptions()
  const { isRunning } = useEngineState()

  const [selectedTag, setSelectedTag] = useState("")
  const [latencies, setLatencies] = useState<Record<string, number>>({})
  const [isTestingSpeed, setIsTestingSpeed] = useState(false)
  const [sortMode, setSortMode] = useState<"default" | "latency" | "name">("default")

  // Sync selected node tag from store or clash API
  useEffect(() => {
    let active = true
    const syncActiveNode = async () => {
      if (isRunning) {
        const group = await fetchSelectGroup()
        if (group && active) {
          setSelectedTag(group.now)
          await setStoreValue(SELECTED_NODE_KEY, group.now)
        }
      } else {
        const saved = await getStoreValue(SELECTED_NODE_KEY)
        const hasSaved = nodes.some((n) => n.name === saved)
        if (saved && hasSaved && active) {
          setSelectedTag(saved)
        } else if (nodes.length > 0 && active) {
          setSelectedTag(nodes[0].name)
          await setStoreValue(SELECTED_NODE_KEY, nodes[0].name)
        }
      }
    }

    const initNodeOnStartup = async () => {
      if (isRunning) {
        // Wait 500ms for Clash API to fully spin up
        await new Promise((resolve) => setTimeout(resolve, 500))
        const saved = await getStoreValue(SELECTED_NODE_KEY)
        const hasSaved = nodes.some((n) => n.name === saved)
        if (saved && hasSaved && active) {
          await selectProxyNode(saved)
        } else if (nodes.length > 0 && active) {
          await selectProxyNode(nodes[0].name)
        }
      }
    }

    initNodeOnStartup().then(() => {
      syncActiveNode()
    })

    // Poll current node if running
    let interval: ReturnType<typeof setInterval>
    if (isRunning) {
      interval = setInterval(syncActiveNode, 3000)
    }

    return () => {
      active = false
      if (interval) clearInterval(interval)
    }
  }, [isRunning, nodes])

  const handleSelectNode = async (nodeTag: string) => {
    setSelectedTag(nodeTag)
    await setStoreValue(SELECTED_NODE_KEY, nodeTag)
    if (isRunning) {
      await selectProxyNode(nodeTag)
      // Dispatch once quickly in case connection is fast
      setTimeout(() => {
        window.dispatchEvent(new Event("node-changed"))
      }, 600)
      // Dispatch again later to guarantee fresh info after connection/handshake settles
      setTimeout(() => {
        window.dispatchEvent(new Event("node-changed"))
      }, 1800)
    }
  }

  const handleSpeedTest = async () => {
    if (isTestingSpeed) return
    setLatencies({})
    setIsTestingSpeed(true)

    try {
      // Test delays in parallel and update state incrementally for real-time progress
      await Promise.all(
        nodes.map(async (node) => {
          const delay = await pingNodeTcp(node.host, Number(node.port))
          setLatencies((prev) => ({
            ...prev,
            [node.name]: delay,
          }))
        })
      )
    } catch (e) {
      console.error(e)
    } finally {
      setIsTestingSpeed(false)
    }
  }

  // Auto speed test when nodes list is loaded or updated and no latencies are tested yet
  useEffect(() => {
    if (nodes.length > 0 && !isTestingSpeed) {
      const hasNoLatency = nodes.every((node) => latencies[node.name] === undefined)
      if (hasNoLatency) {
        handleSpeedTest()
      }
    }
  }, [nodes])

  // Map nodes to include latency details and sort if chosen
  const displayNodes = useMemo(() => {
    const mapped = nodes.map((node) => {
      const delay = latencies[node.name]
      let latencyLabel = "未测速"
      if (delay !== undefined) {
        if (delay > 0) {
          latencyLabel = `${delay} ms`
        } else {
          latencyLabel = "超时"
        }
      } else if (isTestingSpeed) {
        latencyLabel = "测速中"
      }
      return {
        ...node,
        latency: delay ?? -1,
        latencyLabel,
      }
    })

    if (sortMode === "latency") {
      return [...mapped].sort((a, b) => {
        const aVal = a.latency <= 0 ? 999999 : a.latency
        const bVal = b.latency <= 0 ? 999999 : b.latency
        return aVal - bVal
      })
    }
    if (sortMode === "name") {
      return [...mapped].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))
    }
    return mapped
  }, [nodes, latencies, sortMode, isTestingSpeed])

  return (
    <Card className="flex min-h-0 flex-1 flex-col rounded-[20px] overflow-hidden @container">
      <div className="flex items-center justify-between px-3 sm:px-4 pt-3.5 pb-2.5">
        <div className="flex items-center gap-1.5">
          <CardTitle>选择代理节点</CardTitle>
          <span className={badge.brand}>共 {displayNodes.length} 个节点</span>
        </div>
        <div className="flex gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSpeedTest}
            disabled={isTestingSpeed}
            className={cn(btn.accent, "h-8 px-2.5 sm:px-3")}
          >
            <ActivityIcon className={cn("size-3.5 mr-1", isTestingSpeed && "animate-spin")} />
            {isTestingSpeed ? "测速中" : "一键测速"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (sortMode === "default") setSortMode("latency")
              else if (sortMode === "latency") setSortMode("name")
              else setSortMode("default")
            }}
            className={cn(
              "h-8 px-2.5 sm:px-3",
              sortMode !== "default" ? btn.accent : btn.accentMuted
            )}
          >
            <ArrowDownUpIcon className="size-3.5 mr-1" />
            {sortMode === "default" && "默认排序"}
            {sortMode === "latency" && "延迟排序"}
            {sortMode === "name" && "名称排序"}
          </Button>
        </div>
      </div>

      <CardContent className="flex min-h-0 flex-1 flex-col pt-2 overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden no-scrollbar">
          {subLoading ? (
            <div className={cn("flex items-center justify-center py-8", type.description)}>
              加载中...
            </div>
          ) : displayNodes.length === 0 ? (
            <div className={cn("flex items-center justify-center py-8", type.description)}>
              暂无节点，请先添加订阅
            </div>
          ) : (
            <div className="grid grid-cols-1 @[480px]:grid-cols-2 @[720px]:grid-cols-3 gap-2 p-0.5 pt-2 pb-2">
              {displayNodes.map((node) => {
                const isSelected = selectedTag === node.name
                return (
                  <button
                    key={node.name}
                    onClick={() => handleSelectNode(node.name)}
                    className={cn(
                      "flex items-center justify-between rounded-[14px] p-2 sm:p-2.5 transition-all border duration-200 min-w-0 text-left w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                      isSelected
                        ? "bg-secondary border-primary/30 shadow-sm"
                        : "bg-muted/20 border-border/70 hover:bg-muted/40 dark:bg-white/[0.02] dark:hover:bg-white/[0.05]"
                    )}
                  >
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                      <div
                        className={cn(
                          "flex size-7 sm:size-8 shrink-0 items-center justify-center rounded-xl transition-colors text-base sm:text-lg",
                          isSelected
                            ? "bg-secondary text-primary"
                            : "bg-background text-muted-foreground border border-border"
                        )}
                      >
                        {getFlagEmoji(node.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "truncate type-label font-semibold",
                            isSelected && "text-primary"
                          )}
                        >
                          {node.name}
                        </p>
                        <p className={cn(type.caption, "truncate mt-0.5 font-mono")}>
                          {node.host}:{node.port}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 ml-2 shrink-0">
                      <span
                        className={cn(
                          "type-caption font-semibold font-mono transition-opacity duration-200",
                          node.latencyLabel === "未测速"
                            ? "opacity-0 select-none pointer-events-none"
                            : "opacity-100",
                          node.latencyLabel === "超时"
                            ? "text-rose-500"
                            : node.latencyLabel === "测速中"
                            ? "text-blue-500 dark:text-blue-400 animate-pulse"
                            : node.latency > 0
                            ? node.latency < 500
                              ? "text-emerald-500"
                              : "text-amber-500"
                            : "text-rose-500"
                        )}
                      >
                        {node.latencyLabel}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
