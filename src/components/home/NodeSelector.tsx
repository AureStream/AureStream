import { useState, useEffect, useMemo } from "react"
import { ArrowDownUpIcon, GlobeIcon, ActivityIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardTitle } from "@/components/ui/card"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { useSubscriptions } from "@/hooks/useSubscriptions"
import { useEngineState } from "@/hooks/useEngineState"
import { fetchSelectGroup, selectProxyNode, testNodeDelay } from "@/utils/clash-api"
import { getStoreValue, setStoreValue } from "@/single/store"

const SELECTED_NODE_KEY = "selected_node_tag"

export function NodeSelector() {
  const { nodes, loading: subLoading } = useSubscriptions()
  const { isRunning } = useEngineState()

  const [selectedTag, setSelectedTag] = useState("")
  const [latencies, setLatencies] = useState<Record<string, number>>({})
  const [isTestingSpeed, setIsTestingSpeed] = useState(false)
  const [sortByLatency, setSortByLatency] = useState(false)

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
        if (saved && active) {
          setSelectedTag(saved)
        } else if (nodes.length > 0 && active) {
          setSelectedTag(nodes[0].name)
        }
      }
    }
    syncActiveNode()

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
    }
  }

  const handleSpeedTest = async () => {
    if (!isRunning) {
      alert("请先启动代理连接，再进行一键测速")
      return
    }
    if (isTestingSpeed) return
    setIsTestingSpeed(true)

    try {
      // Test delays in parallel
      const promises = nodes.map(async (node) => {
        const delay = await testNodeDelay(node.name)
        return { tag: node.name, delay }
      })
      const results = await Promise.all(promises)
      const newLatencies: Record<string, number> = {}
      for (const res of results) {
        newLatencies[res.tag] = res.delay
      }
      setLatencies(newLatencies)
    } catch (e) {
      console.error(e)
    } finally {
      setIsTestingSpeed(false)
    }
  }

  // Map nodes to include latency details and sort if chosen
  const displayNodes = useMemo(() => {
    const mapped = nodes.map((node) => {
      const delay = latencies[node.name] ?? -1
      let latencyLabel = "未测速"
      if (delay > 0) {
        latencyLabel = `${delay} ms`
      } else if (delay === -1 && isTestingSpeed) {
        latencyLabel = "测速中"
      } else if (delay === -1 && Object.keys(latencies).length > 0) {
        latencyLabel = "超时"
      }
      return {
        ...node,
        latency: delay,
        latencyLabel,
      }
    })

    if (sortByLatency) {
      return [...mapped].sort((a, b) => {
        const aVal = a.latency <= 0 ? 999999 : a.latency
        const bVal = b.latency <= 0 ? 999999 : b.latency
        return aVal - bVal
      })
    }
    return mapped
  }, [nodes, latencies, sortByLatency, isTestingSpeed])

  return (
    <Card className="flex min-h-0 flex-1 flex-col rounded-[20px] overflow-hidden @container">
      <div className="flex items-center justify-between px-3 sm:px-4 pt-3.5 pb-2.5">
        <div className="flex items-center gap-1.5">
          <CardTitle className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">
            选择代理节点
          </CardTitle>
          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500 dark:bg-white/[0.06] dark:text-slate-400">
            共 {displayNodes.length} 个节点
          </span>
        </div>
        <div className="flex gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSpeedTest}
            disabled={isTestingSpeed || !isRunning}
            className="h-8 px-3 rounded-lg bg-[#eef2ff] text-[#3b59ff] text-xs font-bold hover:bg-blue-100/60 dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20 transition-colors"
          >
            <ActivityIcon className={cn("size-3.5 mr-1", isTestingSpeed && "animate-spin")} />
            {isTestingSpeed ? "测速中" : "一键测速"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSortByLatency(!sortByLatency)}
            className={cn(
              "h-8 px-3 rounded-lg text-xs font-bold transition-colors",
              sortByLatency
                ? "bg-[#eef2ff] text-[#3b59ff] dark:bg-blue-500/15 dark:text-blue-400"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200/60 dark:bg-white/[0.06] dark:text-white/70 dark:hover:bg-white/[0.1]"
            )}
          >
            <ArrowDownUpIcon className="size-3.5 mr-1" />
            延迟排序
          </Button>
        </div>
      </div>

      <CardContent className="flex min-h-0 flex-1 flex-col pt-0 overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden no-scrollbar">
          {subLoading ? (
            <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
              加载中...
            </div>
          ) : displayNodes.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
              暂无节点，请先添加订阅
            </div>
          ) : (
            <RadioGroup
              value={selectedTag}
              onValueChange={handleSelectNode}
              className="grid grid-cols-1 @[480px]:grid-cols-2 @[720px]:grid-cols-3 gap-2 pb-2"
            >
              {displayNodes.map((node) => {
                const isSelected = selectedTag === node.name
                const hasDelay = node.latency > 0
                return (
                  <label
                    key={node.id}
                    htmlFor={`node-${node.id}`}
                    className={cn(
                      "flex cursor-pointer items-center justify-between rounded-[14px] p-2 sm:p-2.5 transition-all border duration-200 min-w-0",
                      isSelected
                        ? "bg-[#f4f7ff] border-[#bfdbfe]/60 shadow-[0_2px_8px_rgba(59,89,255,0.04)] dark:bg-blue-500/10 dark:border-blue-500/30"
                        : "bg-[#f8fafc]/30 border-slate-200/60 hover:bg-[#f8fafc]/60 dark:bg-white/[0.02] dark:border-white/[0.06] dark:hover:bg-white/[0.05]"
                    )}
                  >
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                      <div
                        className={cn(
                          "flex size-7 sm:size-8 shrink-0 items-center justify-center rounded-xl transition-colors",
                          isSelected
                            ? "bg-[#eef2ff] text-[#3b59ff] dark:bg-blue-500/25 dark:text-blue-400"
                            : "bg-white text-slate-400 border border-slate-100 dark:bg-black dark:text-slate-500 dark:border-white/[0.08]"
                        )}
                      >
                        <GlobeIcon className="size-3.5 sm:size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "truncate text-xs font-semibold",
                            isSelected
                              ? "text-[#3b59ff] dark:text-blue-400"
                              : "text-slate-800 dark:text-slate-200"
                          )}
                        >
                          {node.name}
                        </p>
                        <p className="truncate text-[10px] text-muted-foreground mt-0.5">
                          {node.host}:{node.port}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 ml-3 shrink-0">
                      <span
                        className={cn(
                          "text-[10px] font-semibold",
                          hasDelay
                            ? node.latency < 200
                              ? "text-emerald-500"
                              : node.latency < 500
                              ? "text-amber-500"
                              : "text-rose-500"
                            : "text-slate-500 dark:text-slate-400"
                        )}
                      >
                        {node.latencyLabel}
                      </span>
                      <RadioGroupItem
                        value={node.name}
                        id={`node-${node.id}`}
                        className="size-4 text-[#3b59ff] border-slate-300 dark:border-white/[0.1]"
                      />
                    </div>
                  </label>
                )
              })}
            </RadioGroup>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
