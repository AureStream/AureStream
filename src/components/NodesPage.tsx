import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { getSubscriptionConfig } from "../action/db"
import { getStoreValue, setStoreValue, getAutoFailoverEnabled, setAutoFailoverEnabled, setLastManualNodeTag } from "../single/store"
import { SSI_STORE_KEY, selectedNodeTagStoreKey } from "../types/definition"
import { switchNodeActive } from "../lib/hot-reload-config"
import { getNodeLatency, initNodeLatency, setNodeLatency } from "../lib/node-latency"
import { getNodeLatencyTone } from "../lib/node-latency-tone"
import { requestNetworkInfoRefresh } from "../lib/home-network-info"
import { testNodeTcpLatency } from "../lib/node-speed-test"
import { buildNodeList, type NodeData } from "../lib/nodes-page-model"
import MobileTopBar, { topBarIconBtnClass } from "./MobileTopBar"

/* ── Icons ── */
const I = {
  Activity: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  Sort: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="11" y1="18" x2="13" y2="18" />
    </svg>
  ),
}

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
          const mapped = buildNodeList(config.outbounds, getNodeLatency);
          setNodes(mapped);
        }
      } catch (err) {
        console.error("Failed to load nodes in NodesPage:", err);
      }
    };
    loadNodes();
  }, []);

  const handleSpeedTest = async () => {
    if (isTestingSpeed || nodes.length === 0) return;
    setIsTestingSpeed(true);
    setNodes(prev => prev.map(n => ({ ...n, ping: 0 })));

    try {
      await Promise.all(
        nodes.map(async (n) => {
          const delay = await testNodeTcpLatency(n)
          setNodeLatency(n.id, delay)
          setNodes(prev => prev.map(p => (p.id === n.id ? { ...p, ping: delay } : p)))
        })
      )
    } catch (err) {
      console.error("Speed test failed:", err)
    } finally {
      setIsTestingSpeed(false);
    }
  }

  const handleToggleSort = () => {
    // 点击 → 延迟排序；再次点击 → 名称排序
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
    <div className="flex flex-col w-full h-full animate-fade-in overflow-hidden">
      <div className="w-full shrink-0">
        <MobileTopBar
          onBack={() => navigate("/dashboard")}
          title={"节点列表"}
          right={
            <>
              <button
                onClick={handleSpeedTest}
                disabled={isTestingSpeed}
                className={`${topBarIconBtnClass} disabled:opacity-50`}
                aria-label="Speed test"
                title={"延迟测速"}
              >
                <span className={isTestingSpeed ? 'animate-pulse' : ''}><I.Activity /></span>
              </button>
              <button
                onClick={handleToggleSort}
                className={topBarIconBtnClass}
                aria-label="Sort"
                title={
                  sortBy === "ping"
                    ? "当前：延迟排序 · 点击切换名称"
                    : "当前：名称排序 · 点击切换延迟"
                }
              >
                <I.Sort />
              </button>
            </>
          }
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-[30px] pt-2 pb-6">
        <div className="w-full flex flex-col gap-2.5">
          {sortedNodes.map(node => {
            const isConnected = connectedNodeId === node.id

            return (
              <button
                type="button"
                key={node.key}
                onClick={async () => {
                  setConnectedNodeId(node.id)
                  if (activeSubId) {
                    const key = selectedNodeTagStoreKey(activeSubId)
                    await setStoreValue(key, node.id, { immediate: true })
                    // Track manual node selection for auto-failover
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
                }}
                className={`w-full text-left rounded-2xl px-3.5 py-4 border flex items-center gap-3 cursor-pointer transition-colors ${
                  isConnected
                    ? "bg-[#EFECFF]/70 dark:bg-[#6C5CFF]/15 border-[#6C5CFF]/35"
                    : "bg-white/70 dark:bg-bg-alt/70 border-slate-200/80 dark:border-white/10 hover:bg-white dark:hover:bg-bg-alt"
                }`}
              >
                <span className="text-2xl shrink-0 select-none w-8 text-center">{node.flag}</span>

                <div className="min-w-0 flex-1 flex items-center gap-2">
                  <h4 className="text-sm font-black text-slate-900 dark:text-white truncate" title={node.name}>
                    {node.name}
                  </h4>
                  <span className="ml-auto shrink-0 flex items-center gap-1 font-mono text-xs font-bold tabular-nums">
                    {isTestingSpeed && node.ping === 0 ? (
                      <span className="animate-pulse text-slate-400">--</span>
                    ) : node.ping < 0 ? (
                      <span className="text-danger">{"超时"}</span>
                    ) : node.ping === 0 ? (
                      <span className="text-slate-400">-- ms</span>
                    ) : (
                      (() => {
                        const tone = getNodeLatencyTone(node.ping)
                        return (
                          <>
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tone.dot}`} />
                            <span className={tone.text}>{node.ping}ms</span>
                          </>
                        )
                      })()
                    )}
                  </span>
                </div>

                <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                  isConnected
                    ? "border-2 border-[#6C5CFF] bg-[#6C5CFF]"
                    : "border-2 border-slate-300 dark:border-slate-600 bg-transparent"
                }`}>
                  {isConnected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
              </button>
            )
          })}

          {sortedNodes.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-text-muted">
              <I.Activity />
              <p className="mt-4 text-sm">{"暂无节点"}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
