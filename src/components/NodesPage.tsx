import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Activity, ArrowUpDown } from "lucide-react"
import { getSubscriptionConfig } from "../action/db"
import {
  getAutoFailoverEnabled,
  getStoreValue,
  setAutoFailoverEnabled,
  setLastManualNodeTag,
  setStoreValue,
} from "../single/store"
import { SSI_STORE_KEY, selectedNodeTagStoreKey } from "../types/definition"
import { switchNodeActive } from "../lib/hot-reload-config"
import { getNodeLatency, initNodeLatency, setNodeLatency } from "../lib/node-latency"
import { getNodeLatencyTone } from "../lib/node-latency-tone"
import { requestNetworkInfoRefresh } from "../lib/home-network-info"
import { testNodeTcpLatency } from "../lib/node-speed-test"
import { buildNodeList, type NodeData } from "../lib/nodes-page-model"
import MobileTopBar, { topBarIconBtnClass } from "./MobileTopBar"
import { cn } from "@/lib/utils"

export default function NodesPage() {
  const navigate = useNavigate()

  const [connectedNodeId, setConnectedNodeId] = useState<string>("")
  const [activeSubId, setActiveSubId] = useState<string>("")

  const [nodes, setNodes] = useState<NodeData[]>([])
  const [isTestingSpeed, setIsTestingSpeed] = useState(false)
  const [sortBy, setSortBy] = useState<"name" | "ping">("name")

  useEffect(() => {
    const loadNodes = async () => {
      await initNodeLatency()
      const subId = await getStoreValue(SSI_STORE_KEY)
      if (!subId) return
      setActiveSubId(subId)

      const key = selectedNodeTagStoreKey(subId)
      const savedNodeId = await getStoreValue(key)
      if (savedNodeId) {
        setConnectedNodeId(savedNodeId)
      }

      try {
        const config = await getSubscriptionConfig(subId)
        if (config && Array.isArray(config.outbounds)) {
          const mapped = buildNodeList(config.outbounds, getNodeLatency)
          setNodes(mapped)
        }
      } catch (err) {
        console.error("Failed to load nodes in NodesPage:", err)
      }
    }
    void loadNodes()
  }, [])

  const handleSpeedTest = async () => {
    if (isTestingSpeed || nodes.length === 0) return
    setIsTestingSpeed(true)
    setNodes((prev) => prev.map((n) => ({ ...n, ping: 0 })))

    try {
      await Promise.all(
        nodes.map(async (n) => {
          const delay = await testNodeTcpLatency(n)
          setNodeLatency(n.id, delay)
          setNodes((prev) => prev.map((p) => (p.id === n.id ? { ...p, ping: delay } : p)))
        }),
      )
    } catch (err) {
      console.error("Speed test failed:", err)
    } finally {
      setIsTestingSpeed(false)
    }
  }

  const handleToggleSort = () => {
    setSortBy((prev) => (prev === "ping" ? "name" : "ping"))
  }

  const sortedNodes = [...nodes].sort((a, b) => {
    if (sortBy === "ping") {
      const pingA = a.ping <= 0 ? 9999 : a.ping
      const pingB = b.ping <= 0 ? 9999 : b.ping
      return pingA - pingB
    }
    return a.name.localeCompare(b.name, "zh-CN")
  })

  return (
    <div className="flex h-full w-full flex-col overflow-hidden animate-fade-in">
      <div className="w-full shrink-0">
        <MobileTopBar
          onBack={() => navigate("/dashboard")}
          title="节点列表"
          right={
            <>
              <button
                type="button"
                onClick={() => void handleSpeedTest()}
                disabled={isTestingSpeed}
                className={cn(topBarIconBtnClass, "disabled:opacity-50")}
                aria-label="延迟测速"
                title="延迟测速"
              >
                <Activity className={cn("size-5", isTestingSpeed && "animate-pulse")} />
              </button>
              <button
                type="button"
                onClick={handleToggleSort}
                className={topBarIconBtnClass}
                aria-label="排序"
                title={
                  sortBy === "ping"
                    ? "当前：延迟排序 · 点击切换名称"
                    : "当前：名称排序 · 点击切换延迟"
                }
              >
                <ArrowUpDown className="size-5" />
              </button>
            </>
          }
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-[30px] pb-6 pt-2">
        <div className="flex w-full flex-col gap-2.5">
          {sortedNodes.map((node) => {
            const isConnected = connectedNodeId === node.id

            return (
              <button
                type="button"
                key={node.key}
                onClick={() => {
                  void (async () => {
                    setConnectedNodeId(node.id)
                    if (activeSubId) {
                      const key = selectedNodeTagStoreKey(activeSubId)
                      await setStoreValue(key, node.id, { immediate: true })
                      await setLastManualNodeTag(node.id)
                      const failoverEnabled = await getAutoFailoverEnabled()
                      if (failoverEnabled) {
                        await setAutoFailoverEnabled(false)
                      }
                      const changedWhileRunning = await switchNodeActive(activeSubId, node.id)
                      if (changedWhileRunning) {
                        requestNetworkInfoRefresh("node-switched")
                      }
                    }
                  })()
                }}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-3 rounded-2xl border px-3.5 py-4 text-left transition-colors",
                  isConnected
                    ? "border-primary/35 bg-primary/10"
                    : "border-border bg-card hover:bg-muted/50",
                )}
              >
                <span className="w-8 shrink-0 select-none text-center text-2xl">{node.flag}</span>

                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <h4
                    className="truncate text-sm font-black text-foreground"
                    title={node.name}
                  >
                    {node.name}
                  </h4>
                  <span className="ml-auto flex shrink-0 items-center gap-1 font-mono text-xs font-bold tabular-nums">
                    {isTestingSpeed && node.ping === 0 ? (
                      <span className="animate-pulse text-muted-foreground">--</span>
                    ) : node.ping < 0 ? (
                      <span className="text-destructive">超时</span>
                    ) : node.ping === 0 ? (
                      <span className="text-muted-foreground">-- ms</span>
                    ) : (
                      (() => {
                        const tone = getNodeLatencyTone(node.ping)
                        return (
                          <>
                            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", tone.dot)} />
                            <span className={tone.text}>{node.ping}ms</span>
                          </>
                        )
                      })()
                    )}
                  </span>
                </div>

                <div
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                    isConnected
                      ? "border-primary bg-primary"
                      : "border-muted-foreground/40 bg-transparent",
                  )}
                >
                  {isConnected ? <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" /> : null}
                </div>
              </button>
            )
          })}

          {sortedNodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Activity className="size-5" />
              <p className="mt-4 text-sm">暂无节点</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
