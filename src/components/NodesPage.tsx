import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
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
import MobileTopBar from "./MobileTopBar"

/* ── Icons ── */
const I = {
  Activity: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>),
  Sort: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 4-8 8h14L15 4zM9 20l8-8H3l6 8z"/></svg>),
}

export default function NodesPage() {
  const { i18n } = useTranslation()
  const navigate = useNavigate()
  const l = (en: string, zh: string) => i18n.language.startsWith('zh') ? zh : en;

  const [connectedNodeId, setConnectedNodeId] = useState<string>("")
  const [activeSubId, setActiveSubId] = useState<string>("")

  const [nodes, setNodes] = useState<NodeData[]>([])
  const [isTestingSpeed, setIsTestingSpeed] = useState(false)
  const [sortBy, setSortBy] = useState<"name" | "ping">("ping")

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

  const sortedNodes = [...nodes].sort((a, b) => {
    if (sortBy === "name") {
      return a.name.localeCompare(b.name, i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US')
    }
    if (sortBy === "ping") {
      const pingA = a.ping <= 0 ? 9999 : a.ping
      const pingB = b.ping <= 0 ? 9999 : b.ping
      return pingA - pingB
    }
    return 0 // default order
  })

  return (
    <div className="flex flex-col w-full h-full max-w-[420px] mx-auto animate-fade-in">
      <MobileTopBar
        onBack={() => navigate("/dashboard")}
        title={l("Nodes", "节点列表")}
        right={
          <>
            <button
              onClick={handleSpeedTest}
              disabled={isTestingSpeed}
              className="w-9 h-9 flex items-center justify-center rounded-xl text-text-secondary hover:text-text hover:bg-surface-active/60 transition-colors cursor-pointer disabled:opacity-50"
              aria-label="Speed test"
              title={l("Test Speed", "延迟测速")}
            >
              <span className={isTestingSpeed ? 'animate-pulse' : ''}><I.Activity /></span>
            </button>
            <button
              onClick={() => setSortBy(sortBy === "ping" ? "name" : "ping")}
              className="w-9 h-9 flex items-center justify-center rounded-xl text-text-secondary hover:text-text hover:bg-surface-active/60 transition-colors cursor-pointer"
              aria-label="Sort"
              title={l("Toggle sort (Name / Latency)", "切换排序（按名称/按延迟）")}
            >
              <I.Sort />
            </button>
          </>
        }
      />

      <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-3 flex flex-col gap-2.5">
        {sortedNodes.map(node => {
          const isConnected = connectedNodeId === node.id

          return (
            <div
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
              className="bg-white dark:bg-bg-alt rounded-[12px] p-3.5 shadow-sm border border-slate-100 dark:border-white/10 cursor-pointer flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {/* Flag */}
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 border bg-slate-50 dark:bg-white/5 border-slate-100 dark:border-white/10">
                  {node.flag}
                </div>
                {/* Name + protocol */}
                <div className="min-w-0 flex-1">
                  <h4 className="font-bold text-sm leading-tight truncate text-slate-900 dark:text-white" title={node.name}>
                    {node.name}
                  </h4>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[9px] font-mono text-slate-400 tracking-wider truncate max-w-[120px]" title={node.id}>
                      {node.id.toUpperCase()}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[8px] font-extrabold tracking-wider uppercase shrink-0 bg-slate-100 dark:bg-white/5 text-slate-500 border border-slate-200/50 dark:border-white/10">
                      {node.protocol}
                    </span>
                  </div>
                </div>
              </div>

              {/* Ping latency indicator + Radio button */}
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-[11px] font-mono font-bold flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  {isTestingSpeed && node.ping === 0 ? (
                    <span className="animate-pulse">--</span>
                  ) : node.ping < 0 ? (
                    <span className="text-danger">{l("Timeout", "超时")}</span>
                  ) : node.ping === 0 ? (
                    <span className="text-slate-400">-- ms</span>
                  ) : (
                    (() => {
                      const tone = getNodeLatencyTone(node.ping);
                      return (
                        <>
                          <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`}></span>
                          <span className={tone.text}>{node.ping}ms</span>
                        </>
                      );
                    })()
                  )}
                </div>

                {/* Radio Button Selector (ONLY element changing style on selection) */}
                <div className={`w-4.5 h-4.5 rounded-full flex items-center justify-center transition-colors ${
                  isConnected 
                    ? 'border-2 border-[#00BBA7] bg-[#00BBA7]' 
                    : 'border-2 border-slate-300 dark:border-slate-600 bg-transparent'
                }`}>
                  {isConnected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
              </div>
            </div>
          )
        })}

        {sortedNodes.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-text-muted">
            <I.Activity />
            <p className="mt-4 text-sm">{l("No nodes found.", "暂无节点")}</p>
          </div>
        )}
      </div>
    </div>
  )
}