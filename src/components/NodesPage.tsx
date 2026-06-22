import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { getSubscriptionConfig } from "../action/db"
import { getStoreValue, setStoreValue } from "../single/store"
import { SSI_STORE_KEY, selectedNodeTagStoreKey } from "../types/definition"
import { switchNodeActive } from "../lib/hot-reload-config"
import { getNodeLatency, initNodeLatency, setNodeLatency } from "../lib/node-latency"
import { getNodeLatencyTone } from "../lib/node-latency-tone"
import { requestNetworkInfoRefresh } from "../lib/home-network-info"
import { testNodeTcpLatency } from "../lib/node-speed-test"

/* ── Icons ── */
const I = {
  Search: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>),
  Filter: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>),
  Activity: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>),
  Wifi: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>),
  Zap: () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>),
  Sort: () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 4-8 8h14L15 4zM9 20l8-8H3l6 8z"/></svg>),
}

interface NodeData {
  id: string
  name: string
  flag: string
  ping: number
  protocol: string
  region: "asia" | "america" | "europe"
  server: string
  port: number
}

export default function NodesPage() {
  const { i18n } = useTranslation()
  const l = (en: string, zh: string) => i18n.language.startsWith('zh') ? zh : en;

  const [searchQuery, setSearchQuery] = useState("")
  const [activeRegion, setActiveRegion] = useState<"all" | "asia" | "america" | "europe">("all")
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
          const filtered = config.outbounds.filter((item: any) => {
            return item.type !== "selector" && item.type !== "urltest" && item.type !== "direct" && item.type !== "block" && item.type !== "dns";
          });
          const mapped = filtered.map((n: any) => {
            const tag = n.tag || "";
            let flag = "🌐";
            let region: "asia" | "america" | "europe" = "asia";
            
            if (tag.includes("日本") || tag.toLowerCase().includes("jp") || tag.toLowerCase().includes("tokyo")) {
              flag = "🇯🇵";
              region = "asia";
            } else if (tag.includes("新加坡") || tag.toLowerCase().includes("sg") || tag.toLowerCase().includes("singapore")) {
              flag = "🇸🇬";
              region = "asia";
            } else if (tag.includes("香港") || tag.toLowerCase().includes("hk") || tag.toLowerCase().includes("hong kong")) {
              flag = "🇭🇰";
              region = "asia";
            } else if (tag.includes("美国") || tag.toLowerCase().includes("us") || tag.toLowerCase().includes("america") || tag.toLowerCase().includes("los angeles") || tag.toLowerCase().includes("new york")) {
              flag = "🇺🇸";
              region = "america";
            } else if (tag.includes("英国") || tag.toLowerCase().includes("uk") || tag.toLowerCase().includes("london") || tag.toLowerCase().includes("gb")) {
              flag = "🇬🇧";
              region = "europe";
            } else if (tag.toLowerCase().includes("de") || tag.includes("德国") || tag.toLowerCase().includes("frankfurt")) {
              flag = "🇩🇪";
              region = "europe";
            }
            
            return {
              id: tag,
              name: tag,
              ping: getNodeLatency(tag) ?? 0,
              flag,
              protocol: n.type ? n.type.toUpperCase() : "SHADOWSOCKS",
              region,
              server: n.server || "",
              port: Number(n.server_port) || 0,
            };
          });
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

  const filteredNodes = nodes.filter(node => {
    const matchesSearch = node.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesRegion = activeRegion === "all" || node.region === activeRegion
    return matchesSearch && matchesRegion
  })

  const sortedNodes = [...filteredNodes].sort((a, b) => {
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
    <div className="flex flex-col gap-5 w-full h-full max-w-[1200px] mx-auto animate-fade-in px-8 py-5 overflow-hidden relative">
      
      {/* Controls Header */}
      <div className="shrink-0 flex items-center justify-between gap-4 py-2 w-full overflow-x-auto no-scrollbar">
        
        {/* Region Tabs (iOS Segmented Style) */}
        <div className="flex items-center gap-2 bg-surface/80 backdrop-blur-xl p-1.5 rounded-2xl border border-border-glass shadow-sm shrink-0">
          {(["all", "asia", "america", "europe"] as const).map(region => {
            const labels = {
              all: l("All Regions", "全部节点"),
              asia: l("Asia Pacific", "亚太地区"),
              america: l("Americas", "美洲地区"),
              europe: l("Europe", "欧洲地区")
            }
            return (
              <button
                key={region}
                onClick={() => setActiveRegion(region)}
                className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${activeRegion === region ? 'glass-active-pill' : 'text-text-secondary hover:text-text hover:bg-surface-active/60'}`}
              >
                {labels[region]}
              </button>
            )
          })}
        </div>

        {/* Search and Actions */}
        <div className="flex items-center gap-3 shrink-0 bg-surface/80 backdrop-blur-xl p-1.5 rounded-2xl border border-border-glass shadow-sm">
          <div className="relative w-60">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"><I.Search /></div>
            <input 
              type="text" 
              placeholder={l("Search location...", "搜索国家或城市...")} 
              className="w-full bg-surface-active/50 border-none text-sm text-text rounded-xl pl-10 pr-4 py-2 focus:outline-none focus:ring-0 transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <button 
            onClick={handleSpeedTest}
            disabled={isTestingSpeed}
            className="h-[36px] px-4 rounded-xl bg-secondary hover:bg-secondary/90 text-white transition-all shadow-sm flex items-center gap-2 shrink-0 text-sm font-semibold disabled:opacity-70 disabled:cursor-not-allowed"
          >
            <div className={isTestingSpeed ? 'animate-pulse' : ''}><I.Activity /></div>
            <span>{isTestingSpeed ? l("Testing...", "测速中...") : l("Test Speed", "延迟测速")}</span>
          </button>

          <button
            onClick={() => setSortBy(sortBy === "ping" ? "name" : "ping")}
            className="h-[36px] px-4 rounded-xl bg-surface-active/50 border border-border-glass/40 text-text hover:bg-surface-active/80 transition-all shadow-sm flex items-center gap-2 shrink-0 text-sm font-semibold cursor-pointer"
            title={l("Toggle sort (Name / Latency)", "切换排序（按名称/按延迟）")}
          >
            <I.Sort />
            <span>{sortBy === "ping" ? l("Sort: Latency", "延迟排序") : l("Sort: Name", "名称排序")}</span>
          </button>
        </div>

      </div>

      {/* Nodes Grid Scrollable Area */}
      <div className="flex-1 overflow-y-auto no-scrollbar pr-1 pb-10">
        <div className="grid grid-cols-3 gap-4">
          {sortedNodes.map(node => {
            const isConnected = connectedNodeId === node.id
            
            return (
              <div 
                key={node.id}
                onClick={async () => {
                  setConnectedNodeId(node.id)
                  if (activeSubId) {
                    const key = selectedNodeTagStoreKey(activeSubId)
                    await setStoreValue(key, node.id, { immediate: true })
                    const changedWhileRunning = await switchNodeActive(activeSubId, node.id)
                    if (changedWhileRunning) {
                      requestNetworkInfoRefresh("node-switched")
                    }
                  }
                }}
                className={`glass-card group relative rounded-[20px] p-3.5 cursor-pointer transition-all duration-300 ${isConnected ? 'ring-1 ring-secondary/30 bg-surface-active/50' : 'hover:bg-surface-active/30'}`}
              >

                
                {/* Header Info: Flag, Name, and Ping */}
                <div className="flex items-center justify-between gap-3 relative z-10 w-full mb-3">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {/* Flag Container */}
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 border transition-all ${
                      isConnected ? 'bg-secondary/10 border-secondary/20 shadow-sm' : 'bg-surface-active/40 border-border-glass'
                    }`}>
                      {node.flag}
                    </div>
                    {/* Name, ID & Protocol */}
                    <div className="min-w-0 flex-1">
                      <h4 className={`font-bold text-[14px] leading-tight truncate ${isConnected ? 'text-secondary dark:text-white font-extrabold' : 'text-text'}`} title={node.name}>
                        {node.name}
                      </h4>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[9px] font-mono text-text-muted tracking-wider truncate max-w-[80px]" title={node.id}>
                          {node.id.toUpperCase()}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold tracking-wider uppercase ${isConnected ? 'bg-secondary/15 text-secondary' : 'bg-surface-active text-text-secondary border border-border-glass'}`}>
                          {node.protocol}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Ping latency indicator */}
                  <div className={`px-2 py-1 rounded-lg text-[11px] font-mono font-bold flex items-center gap-1.5 shrink-0 ${isConnected ? 'bg-secondary/15 text-secondary border border-secondary/20' : 'bg-surface-active/60 text-text-secondary border border-border-glass'}`}>
                    {isTestingSpeed && node.ping === 0 ? (
                      <span className="animate-pulse">-- ms</span>
                    ) : node.ping < 0 ? (
                      <span className="text-danger">{l("Timeout", "超时")}</span>
                    ) : node.ping === 0 ? (
                      <span className="text-text-muted">-- ms</span>
                    ) : (
                      (() => {
                        const tone = getNodeLatencyTone(node.ping);
                        return (
                          <>
                            <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-secondary animate-pulse' : tone.dot}`}></span>
                            <span className={tone.text}>{node.ping}ms</span>
                          </>
                        );
                      })()
                    )}
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t border-border-glass/40 my-2.5"></div>

                {/* Footer Info: Status & Quick Connect Icon */}
                <div className="flex items-center justify-between mt-2 relative z-10">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isConnected ? 'bg-secondary' : 'bg-success'}`}></span>
                      <span className={`relative inline-flex rounded-full h-2 w-2 ${isConnected ? 'bg-secondary' : 'bg-success'}`}></span>
                    </span>
                    <div className={`text-xs font-semibold ${isConnected ? 'text-secondary dark:text-white font-bold' : 'text-text-secondary'}`}>
                      {isTestingSpeed ? l("Testing...", "探测中...") : l("Available", "节点可用")}
                    </div>
                  </div>
                  
                  <button className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all shadow-sm ${isConnected ? 'bg-secondary text-text-inverse hover:scale-105' : 'bg-white dark:bg-surface-active border border-border-glass text-text-secondary hover:text-text hover:border-border-light'}`}>
                    {isConnected ? <I.Zap /> : <I.Wifi />}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
        
        {filteredNodes.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-text-muted">
            <I.Search />
            <p className="mt-4 text-sm">{l("No nodes found matching your criteria.", "未找到符合条件的节点。")}</p>
          </div>
        )}
      </div>
    </div>
  )
}
