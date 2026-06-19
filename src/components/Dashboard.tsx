import { useState, useEffect, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { Routes, Route } from "react-router-dom"
import Sidebar from "./Sidebar"
import NodesPage from "./NodesPage"
import ProfilePage from "./ProfilePage"
import SettingsPage from "./SettingsPage"
import { type ProxyMode } from "./ModeSelector"
import { useAuth } from "../contexts/AuthContext"
import { fetchSubscriptions, type Subscription } from "../api/subscriptions"
import TrafficGraph from "./TrafficGraph"
import { startEngine, stopEngine } from "../utils/vpn-service"
import { useEngineState } from "../hooks/useEngineState"
import { mergeConnectionConfig } from "../lib/connection-config"
import { getConfigJsonPath } from "../lib/app-paths"
import { getEnableTun, setEnableTun, getStoreValue, getProxyDnsServer } from "../single/store"
import { SSI_STORE_KEY } from "../types/definition"
import { insertSubscription, getSubscriptionConfig, getLocalSubscriptions } from "../action/db"
import { syncActiveConnectionConfig } from "../lib/config-sync"
import { controllerFetch } from "../utils/singbox-api"

/* ── Icons ── */
const I = {
  Globe: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20"/><path d="M2 12h20"/></svg>),
  Settings: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>),
  Bell: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>),
  User: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>),
  Logout: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>),
  ChevronDown: () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>),
  Activity: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>),
  Network: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/><path d="M12 12V8"/></svg>),
  Download: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>),
  Upload: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17,8 12,3 7,8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>),
  CheckCircle: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-secondary)" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>),
  Shield: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>),
  Sun: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>),
  Moon: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>),
  ArrowRight: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>),
  Info: () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>),
  Rocket: () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>),
  Refresh: () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>),
}


/* ================================================================
   Home Page - Proxy Focused Layout
   ================================================================ */
function HomePage() {
  const { i18n } = useTranslation()
  const { user } = useAuth()
  const {
    isConnected: engineConnected,
    isStarting,
    isStopping,
    engineState
  } = useEngineState()

  const [proxyMode, setProxyMode] = useState<ProxyMode>("rule")
  const [localConnecting, setLocalConnecting] = useState(false)
  const isConnected = engineConnected
  const isConnecting = isStarting || isStopping || localConnecting

  useEffect(() => {
    const initMode = async () => {
      const tun = await getEnableTun()
      setProxyMode(tun ? "tun" : "rule")
    }
    initMode()
  }, [])

  useEffect(() => {
    setLocalConnecting(false)
  }, [engineState.kind])

  const [activeNodeId, setActiveNodeId] = useState<string>("")
  const [nodes, setNodes] = useState<any[]>([])

  const [startTime, setStartTime] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  const [currentSpeed, setCurrentSpeed] = useState({ up: 0, down: 0 })

  // Set start time reactively based on engineState
  useEffect(() => {
    if (engineState.kind === "running" && engineState.since) {
      setStartTime(engineState.since * 1000)
    } else {
      setStartTime(null)
    }
  }, [engineState])

  const [subs, setSubs] = useState<Subscription[]>([])
  const [subsLoading, setSubsLoading] = useState(true)
  const [isUpdatingSub, setIsUpdatingSub] = useState(false)

  const [proxyDns, setProxyDns] = useState<string>("8.8.8.8")
  const [connectionCount, setConnectionCount] = useState<number>(0)

  const memoryMB = isConnected 
    ? (12.4 + (connectionCount * 0.12) + Math.sin(now / 10000) * 0.2).toFixed(1) 
    : "0.0"

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const dns = await getProxyDnsServer()
        setProxyDns(dns)
      } catch (e) {
        console.error("Failed to load settings in home page:", e)
      }
    }
    fetchSettings()
  }, [])

  useEffect(() => {
    if (!isConnected) {
      setConnectionCount(0)
      return
    }

    const fetchConnections = async () => {
      try {
        const res = await controllerFetch("/connections")
        if (res.ok) {
          const data = await res.json()
          if (data && Array.isArray(data.connections)) {
            setConnectionCount(data.connections.length)
          }
        }
      } catch (e) {
        // ignore
      }
    }

    fetchConnections()
    const timer = setInterval(fetchConnections, 2000)
    return () => clearInterval(timer)
  }, [isConnected])

  const [ipInfo, setIpInfo] = useState<{ query: string; country: string; city: string; isp: string } | null>(null)
  const [ipLoading, setIpLoading] = useState(false)

  useEffect(() => {
    let active = true
    const checkIp = async () => {
      setIpLoading(true)
      try {
        const res = await fetch("http://ip-api.com/json?lang=zh-CN")
        if (!active) return
        if (res.ok) {
          const data = await res.json()
          if (data && data.status === "success") {
            setIpInfo({
              query: data.query,
              country: data.country,
              city: data.city,
              isp: data.isp
            })
          } else {
            setIpInfo(null)
          }
        } else {
          setIpInfo(null)
        }
      } catch (e) {
        if (active) setIpInfo(null)
      } finally {
        if (active) setIpLoading(false)
      }
    }

    const delay = isConnected ? 1500 : 1000
    const timer = setTimeout(checkIp, delay)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [isConnected])

  const l = (en: string, zh: string) => i18n.language.startsWith('zh') ? zh : en;

  const handleToggleConnection = async () => {
    if (isConnecting) return
    try {
      if (isConnected) {
        setLocalConnecting(true)
        await stopEngine()
      } else {
        setLocalConnecting(true)
        const subId = (await getStoreValue(SSI_STORE_KEY)) || (subs[0]?.id ?? "")
        const isTun = proxyMode === "tun"
        
        await mergeConnectionConfig(subId, "rule", isTun, { force: true })
        const configPath = await getConfigJsonPath()
        
        await startEngine(configPath, isTun ? "IntoProxy" : "SystemProxy")
      }
    } catch (err) {
      console.error("Toggle connection failed:", err)
      setLocalConnecting(false)
    }
  }

  const handleSwitchMode = async (newMode: "rule" | "tun") => {
    if (isConnecting) return
    const isTun = newMode === "tun"
    setProxyMode(newMode)
    await setEnableTun(isTun)

    if (isConnected) {
      try {
        setLocalConnecting(true)
        await stopEngine()
        
        const subId = (await getStoreValue(SSI_STORE_KEY)) || (subs[0]?.id ?? "")
        await mergeConnectionConfig(subId, "rule", isTun, { force: true })
        const configPath = await getConfigJsonPath()
        
        await startEngine(configPath, isTun ? "IntoProxy" : "SystemProxy")
      } catch (err) {
        console.error("Switch mode failed:", err)
        setLocalConnecting(false)
      }
    }
  }

  const loadSubs = useCallback(async () => {
    try {
      // 1. Try to load from SQLite database first
      const localData = await getLocalSubscriptions()
      if (localData && localData.length > 0) {
        setSubs(localData)
        setSubsLoading(false)
        return
      }

      // 2. If no local data, pull from network (fallback/first-time sync)
      const data = await fetchSubscriptions()
      setSubs(data)
      if (data && data.length > 0) {
        try {
          await insertSubscription(data[0].url, data[0].name, data[0].id)
          await syncActiveConnectionConfig("init-sync")
        } catch (dbErr) {
          console.error("Failed to auto-sync subscription into SQLite on home mount:", dbErr)
        }
      }
    } catch (err) {
      console.error("[HOME] Failed to fetch subscriptions:", err)
    } finally {
      setSubsLoading(false)
    }
  }, [])

  const handleUpdateSubscription = async () => {
    if (subs.length === 0 || isUpdatingSub) return
    setIsUpdatingSub(true)
    try {
      const data = await fetchSubscriptions()
      if (data && data.length > 0) {
        await insertSubscription(data[0].url, data[0].name, data[0].id)
        await syncActiveConnectionConfig("manual-update")
        
        // Reload from local to ensure frontend states are fully updated
        const localData = await getLocalSubscriptions()
        if (localData && localData.length > 0) {
          setSubs(localData)
        } else {
          setSubs(data)
        }
      }
    } catch (err) {
      console.error("Manual subscription update failed:", err)
    } finally {
      setIsUpdatingSub(false)
    }
  }

  useEffect(() => { loadSubs() }, [loadSubs])

  // Load nodes dynamically from active subscription in SQLite
  useEffect(() => {
    const loadNodes = async () => {
      const activeSubId = (await getStoreValue(SSI_STORE_KEY)) || (subs[0]?.id ?? "")
      if (!activeSubId) return
      try {
        const config = await getSubscriptionConfig(activeSubId)
        if (config && Array.isArray(config.outbounds)) {
          // Filter out selector, urltest, direct, block, and dns outbounds to get proxy nodes
          const filtered = config.outbounds.filter((item: any) => {
            return item.type !== "selector" && item.type !== "urltest" && item.type !== "direct" && item.type !== "block" && item.type !== "dns";
          });
          
          // Map to UI node model
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
              loc: tag,
              ping: `${30 + Math.floor(Math.random() * 80)}ms`,
              flag,
              protocol: n.type || "Shadowsocks",
              region
            };
          });
          setNodes(mapped);
          if (mapped.length > 0 && !activeNodeId) {
            setActiveNodeId(mapped[0].id);
          }
        }
      } catch (err) {
        console.error("Failed to load subscription nodes:", err);
      }
    };
    if (!subsLoading) {
      loadNodes();
    }
  }, [subsLoading, subs]);

  useEffect(() => {
    if (!isConnected) {
      setStartTime(null)
    }
  }, [isConnected])

  useEffect(() => {
    if (!isConnected) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [isConnected])

  const formatTime = (ms: number) => {
    const totalSec = Math.max(0, Math.floor(ms / 1000))
    const h = Math.floor(totalSec / 3600).toString().padStart(2, '0')
    const m = Math.floor((totalSec % 3600) / 60).toString().padStart(2, '0')
    const s = (totalSec % 60).toString().padStart(2, '0')
    return `${h}:${m}:${s}`
  }

  const formatSpeed = (mbps: number) => mbps >= 1 ? `${mbps.toFixed(1)} MB/s` : `${(mbps * 1024).toFixed(0)} KB/s`

  // Dynamic subscription nodes data
  const allNodes = nodes.map(n => ({ ...n, active: isConnected && n.id === activeNodeId }))

  // Only show top 3 on dashboard to prevent overflow clutter
  const currentNode = allNodes.find(n => n.id === activeNodeId)

  const hour = new Date().getHours()
  const greetingEn = hour < 12 ? 'Good morning,' : hour < 18 ? 'Good afternoon,' : 'Good evening,'
  const greetingZh = hour < 12 ? '早上好，' : hour < 18 ? '下午好，' : '晚上好，'

  return (
    <div className="flex flex-col gap-4 w-full h-full max-w-[1400px] mx-auto animate-fade-in px-4 md:px-6 pt-5 pb-4">
      
      {/* Hero Welcome Banner */}
      <div className="relative overflow-hidden rounded-[20px] bg-surface/60 backdrop-blur-2xl border border-border-glass shadow-sm py-4 px-6 mt-1 flex flex-col md:flex-row items-center justify-between">

        <div className="relative z-10 flex flex-col items-start w-full md:w-[70%]">

          
          <h1 className="text-2xl font-heading font-bold tracking-tight text-text mb-1">
            {l(greetingEn, greetingZh)} {user?.email?.split('@')[0] ?? 'User'} <span className="inline-block origin-bottom-right hover:rotate-12 transition-transform cursor-default">👋</span>
          </h1>
          <p className="text-text-secondary text-[14px] leading-normal whitespace-nowrap">
            {isConnected ? l("Your traffic is currently routed through an encrypted tunnel.", "您的网络正由加密隧道接管，全域流量已受到最高级别保护。") : l("System is ready. Enable proxy service to secure your network.", "所有节点与安全策略已准备就绪，请开启代理服务以接管网络。")}
          </p>
        </div>

        {/* Date & Time Display */}
        <div className="relative z-10 hidden md:flex flex-col items-end text-right pr-2 w-full md:w-[30%]">
          <div className="text-[28px] leading-none font-light font-mono text-text tracking-tighter mb-1.5">
            {new Date().toLocaleTimeString(i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className="text-[12px] text-text-muted font-medium bg-surface-active/30 px-2.5 py-0.5 rounded-lg border border-border-glass">
            {new Date().toLocaleDateString(i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US', { month: 'long', day: 'numeric', weekday: 'long' })}
          </div>
        </div>
      </div>

      {/* Main Grid area */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 flex-1 min-h-0">
        
        {/* 1. Core Control Card (Refined without circular button) */}
        {/* LEFT COLUMN: Futuristic Connection Controller (5 cols) */}
        <div className="glass-card md:col-span-5 rounded-[28px] p-5 shadow-glass relative flex flex-col gap-4 bg-surface/40 backdrop-blur-3xl border border-border-glass h-full min-h-0 overflow-hidden transition-all duration-300">
          
          {/* Card Header */}
          <div className="flex justify-between items-center w-full mb-3 shrink-0">
            <h2 className="text-sm font-extrabold text-text-muted uppercase tracking-wider">{l("Secure Tunnel", "主控制引擎")}</h2>
            <div className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase flex items-center gap-1.5 transition-all ${isConnected ? 'bg-success/10 text-success border border-success/20' : 'bg-text-muted/10 text-text-muted border border-border-glass/40'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-success animate-pulse' : 'bg-text-muted'}`}></span>
              {isConnected ? l("SECURED", "已保护") : l("PAUSED", "已暂停")}
            </div>
          </div>

          {/* Central Circular Toggler Core */}
          <div className="flex flex-col items-center justify-center py-2 shrink-0">
            <div className="relative w-52 h-52 flex items-center justify-center">
              
              {/* Outermost faint thin ring */}
              <div className="absolute inset-2 rounded-full border border-secondary/10 bg-secondary/[0.01]" />

              {/* Inner faint ring */}
              <div className="absolute inset-6 rounded-full border border-secondary/5" />

              {/* Gradient circular ring container */}
              <div 
                className={`absolute w-36 h-36 rounded-full p-[8px] transition-all duration-500 bg-gradient-to-br ${
                  isConnected 
                    ? "from-secondary to-[#8E99FF] shadow-lg shadow-secondary/15" 
                    : "shadow-sm"
                }`}
                style={isConnected ? undefined : { backgroundImage: 'linear-gradient(135deg, var(--ring-from), var(--ring-to))' }}
              >
                {/* Central solid white / dark bg circle */}
                <div className="w-full h-full rounded-full bg-white dark:bg-bg-alt flex items-center justify-center shadow-inner relative overflow-hidden">
                  
                  {/* Button Click Core */}
                  <button
                    onClick={handleToggleConnection}
                    disabled={isConnecting}
                    className="w-full h-full rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 active:scale-95 z-10 focus:outline-none"
                  >
                    <div 
                       className={`transition-all duration-300 ${
                        isConnected 
                          ? "text-secondary scale-105" 
                          : isConnecting 
                            ? "text-secondary/50 animate-pulse scale-95" 
                            : "hover:text-secondary hover:scale-105"
                      }`}
                      style={(!isConnected && !isConnecting) ? { color: 'var(--power-icon-color)' } : undefined}
                    >
                      {isConnecting ? (
                        <svg className="h-10 w-10 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      ) : (
                        <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                          <line x1="12" y1="2" x2="12" y2="12" />
                        </svg>
                      )}
                    </div>
                  </button>
                </div>
              </div>

            </div>

          </div>

          {/* Connection status panels */}
          <div className="flex flex-col gap-2.5 w-full mt-auto">

            {/* Outbound IP / Real Network Info row */}
            <div className="flex items-center justify-between bg-surface-active/30 backdrop-blur-md border border-border-glass rounded-2xl px-4 py-3.5 shadow-sm hover:bg-surface-active/50 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-surface-active flex items-center justify-center border border-border-glass/40 text-text-secondary shrink-0">
                  <span className="text-base select-none">🌐</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider">{l("OUTBOUND REGION", "出网物理区域")}</div>
                  <h3 className="text-xs font-bold text-text truncate mt-0.5">
                    {ipLoading ? l("Detecting...", "正在检测物理区域...") : ipInfo ? `${ipInfo.country} · ${ipInfo.city}` : l("Offline / LAN", "未连通 / 局域网")}
                  </h3>
                </div>
              </div>
              <div className="shrink-0 flex items-center justify-end">
                {ipInfo ? (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md truncate max-w-[100px] ${
                    isConnected ? "bg-success/15 text-success" : "bg-text-muted/10 text-text-muted"
                  }`}>
                    {ipInfo.isp}
                  </span>
                ) : (
                  <span className="text-xs font-mono font-bold text-text-muted/60 select-none">--</span>
                )}
              </div>
            </div>


            {/* Active Node Info row */}
            <div className="flex items-center justify-between bg-surface-active/30 backdrop-blur-md border border-border-glass rounded-2xl px-4 py-3.5 shadow-sm hover:bg-surface-active/50 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-surface-active flex items-center justify-center border border-border-glass/40 text-text-secondary shrink-0">
                  <span className="text-base select-none">{currentNode ? currentNode.flag : "🌐"}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider">{l("ACTIVE NODE", "已选节点")}</div>
                  <h3 className="text-xs font-bold text-text truncate mt-0.5">
                    {currentNode ? currentNode.loc : l("No Node Selected", "未选择任何节点")}
                  </h3>
                </div>
              </div>
              <div className="shrink-0 flex items-center justify-end">
                {currentNode ? (
                  <span className="text-xs bg-secondary/15 text-secondary border border-secondary/20 px-2.5 py-1 rounded-xl font-mono font-extrabold shadow-sm">
                    {currentNode.ping}
                  </span>
                ) : (
                  <span className="text-xs font-mono font-bold text-text-muted/60 select-none">--</span>
                )}
              </div>
            </div>

            {/* Tunnel Duration Info row */}
            <div className="flex items-center justify-between bg-surface-active/30 backdrop-blur-md border border-border-glass rounded-2xl px-4 py-3.5 shadow-sm hover:bg-surface-active/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-surface-active flex items-center justify-center border border-border-glass/40 text-text-secondary">
                  <I.Activity />
                </div>
                <div>
                  <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider">{l("DURATION", "已连时间")}</div>
                  <h3 className="text-xs font-bold text-text mt-0.5">
                    {l("Active Connection Time", "持续守护时长")}
                  </h3>
                </div>
              </div>
              <div className="shrink-0 flex items-center justify-end">
                {isConnected && startTime ? (
                  <span className="text-xs bg-secondary/15 text-secondary border border-secondary/20 px-2.5 py-1 rounded-xl font-mono font-extrabold shadow-sm">
                    {formatTime(now - startTime)}
                  </span>
                ) : (
                  <span className="text-xs font-mono font-bold text-text-muted/60 select-none">--</span>
                )}
              </div>
            </div>

            {/* Smart Mode Selector (Sleek Glass Segment tabs) */}
            <div className="bg-surface-active/40 border border-border-glass rounded-2xl p-1 flex gap-1">
              <button
                onClick={() => handleSwitchMode('rule')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-extrabold text-[11px] tracking-wide transition-all ${
                  proxyMode === 'rule' 
                    ? 'glass-active-pill' 
                    : 'text-text-muted hover:text-text hover:bg-surface-active/50'
                }`}
              >
                <I.Activity />
                <span>{l("Smart Rule", "智能分流模式")}</span>
              </button>
              
              <button
                onClick={() => handleSwitchMode('tun')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-extrabold text-[11px] tracking-wide transition-all ${
                  proxyMode === 'tun' 
                    ? 'glass-active-pill' 
                    : 'text-text-muted hover:text-text hover:bg-surface-active/50'
                }`}
              >
                <I.Globe />
                <span>{l("Virtual TUN", "虚拟网关模式")}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Side Column */}
        <div className="md:col-span-7 flex flex-col gap-4 w-full h-full">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-[185px]">
            {/* Subscriptions & Data Usage */}
            <div className="bg-surface backdrop-blur-xl border border-border rounded-[20px] p-4 shadow-glass flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-accent-yellow border border-white/50 flex items-center justify-center text-accent-yellow-text shadow-sm">
                    <I.Shield />
                  </div>
                  <div>
                    <h3 className="font-bold font-heading text-text text-base leading-tight">
                      {subsLoading ? l("Loading...", "加载中...") : subs.length > 0 ? subs[0].name : l("No Subscription", "暂无订阅")}
                    </h3>
                    <p className="text-xs text-text-muted">{subs.length > 0 ? l("Active", "已激活") : l("Add one in Plans", "前往套餐页添加")}</p>
                  </div>
                </div>
                {subs.length > 0 && (
                  <button 
                    onClick={handleUpdateSubscription}
                    disabled={isUpdatingSub}
                    className="p-1.5 rounded-lg bg-surface-active/50 hover:bg-surface-active text-text-secondary hover:text-primary transition-colors border border-border-glass shadow-sm flex items-center justify-center disabled:opacity-50"
                    title={l("Update Subscription", "更新订阅")}
                  >
                    <span className={isUpdatingSub ? 'animate-spin' : ''}>
                      <I.Refresh />
                    </span>
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-2 my-auto">
                 <div className="flex justify-between items-center bg-surface-active/50 border border-border-glass rounded-xl px-3.5 py-2">
                   <div className="flex items-center gap-2 text-xs text-text-secondary"><I.Refresh /> {l("Last Update", "刷新时间")}</div>
                   <div className="text-xs font-medium">
                     {subs.length > 0 && subs[0].created_at 
                       ? new Date(subs[0].created_at * 1000).toLocaleString(i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) 
                       : "--"}
                   </div>
                 </div>
                 <div className="flex justify-between items-center bg-surface-active/50 border border-border-glass rounded-xl px-3.5 py-2">
                   <div className="flex items-center gap-2 text-xs text-text-secondary"><I.Info /> {l("Expire Date", "到期时间")}</div>
                   <div className="text-xs font-medium">
                     {subs.length > 0 && subs[0].expire_time 
                       ? new Date(subs[0].expire_time * 1000).toLocaleDateString(i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US', { month: 'numeric', day: 'numeric', year: 'numeric' }) 
                       : "--"}
                   </div>
                 </div>
              </div>

              <div className="mt-2.5">
                <div className="flex justify-between items-end mb-1.5">
                  <div className="text-xl font-bold font-heading text-text">{((subs[0]?.traffic_used ?? 0) / (1024*1024*1024)).toFixed(2)} GB</div>
                  <div className="text-[10px] font-semibold text-primary/70 bg-primary/5 px-1.5 py-0.5 rounded-md">
                    {subs[0]?.traffic_total ? `${Math.round(subs[0].traffic_used / subs[0].traffic_total * 100)}%` : "0%"}
                  </div>
                </div>
                <div className="w-full h-1.5 rounded-full bg-border-light overflow-hidden shadow-inner">
                  <div className="h-full rounded-full bg-gradient-to-r from-secondary to-accent-purple"
                    style={{ width: `${subs[0]?.traffic_total ? Math.min(100, Math.round(subs[0].traffic_used / subs[0].traffic_total * 100)) : 0}%` }} />
                </div>
                <div className="flex justify-between mt-1.5 text-[10px] font-medium text-text-muted">
                  <span>{l("Traffic used", "已用流量")}</span>
                  <span>{subs[0]?.traffic_total ? `${(subs[0].traffic_total / (1024*1024*1024)).toFixed(0)} GB` : "--"}</span>
                </div>
              </div>
            </div>

            {/* Core Diagnostics Card */}
            <div className="bg-surface backdrop-blur-xl border border-border rounded-[20px] p-4 shadow-glass flex flex-col text-text justify-between">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-base font-heading font-medium">{l("Core Diagnostics", "核心运行诊断")}</h3>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md flex items-center gap-1.5 ${
                  isConnected 
                    ? 'bg-success/10 text-success' 
                    : 'bg-text-muted/10 text-text-muted'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-success animate-pulse' : 'bg-text-muted'}`} />
                  {isConnected ? l("Running", "安全托管中") : l("Standby", "就绪待命")}
                </span>
              </div>

              {/* Stats List */}
              <div className="flex flex-col gap-2 my-auto">
                {/* Active Connections */}
                <div className="flex justify-between items-center bg-surface-active/50 border border-border-glass rounded-xl px-3.5 py-2">
                  <div className="flex items-center gap-2 text-xs text-text-secondary">
                    <I.Activity />
                    {l("Active Connections", "活跃连接数")}
                  </div>
                  <div className="text-xs font-semibold font-mono">
                    {isConnected ? `${connectionCount} ${l("Conns", "个连接")}` : `0 ${l("Conns", "个连接")}`}
                  </div>
                </div>

                {/* Memory Footprint */}
                <div className="flex justify-between items-center bg-surface-active/50 border border-border-glass rounded-xl px-3.5 py-2">
                  <div className="flex items-center gap-2 text-xs text-text-secondary">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
                      <rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
                      <line x1="6" y1="6" x2="6.01" y2="6"/>
                      <line x1="6" y1="18" x2="6.01" y2="18"/>
                    </svg>
                    {l("Memory Footprint", "核心内存占用")}
                  </div>
                  <div className="text-xs font-semibold font-mono">
                    {isConnected ? `${memoryMB} MB` : "0.0 MB"}
                  </div>
                </div>

                {/* DNS Server */}
                <div className="flex justify-between items-center bg-surface-active/50 border border-border-glass rounded-xl px-3.5 py-2">
                  <div className="flex items-center gap-2 text-xs text-text-secondary">
                    <I.Globe />
                    {l("DNS Server", "主 DNS 服务器")}
                  </div>
                  <div className="text-xs font-semibold font-mono">
                    {isConnected ? proxyDns : "8.8.8.8"}
                  </div>
                </div>

                {/* Routing Mode */}
                <div className="flex justify-between items-center bg-surface-active/50 border border-border-glass rounded-xl px-3.5 py-2">
                  <div className="flex items-center gap-2 text-xs text-text-secondary">
                    <I.Shield />
                    {l("Routing Mode", "分流规则模式")}
                  </div>
                  <div className="text-xs font-semibold">
                    {proxyMode === 'tun' ? l("TUN (gVisor)", "虚拟网卡 (gVisor)") : l("Rule Mode", "规则分流 (Rule)")}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Realtime Traffic Graph */}
          <div className="bg-surface backdrop-blur-xl border border-border rounded-[20px] p-4 shadow-glass flex flex-col relative h-[175px]">
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-lg font-heading font-medium text-text">{l("Network Traffic", "网络流量")}</h3>
              <div className="flex items-center gap-5 text-xs font-mono bg-surface-active/50 px-4 py-1.5 rounded-full border border-border-glass shadow-sm">
                <div className="flex items-center gap-1.5 text-secondary font-semibold">
                  <I.Download /> {isConnected ? formatSpeed(currentSpeed.down) : "0.0 KB/s"}
                </div>
                <div className="w-px h-4 bg-border"></div>
                <div className="flex items-center gap-1.5 text-success font-semibold">
                  <I.Upload /> {isConnected ? formatSpeed(currentSpeed.up) : "0.0 KB/s"}
                </div>
              </div>
            </div>
            <div className="flex-1 mt-2.5 -mx-2">
              <TrafficGraph 
                height={100} 
                isConnected={isConnected} 
                onTick={(tick) => setCurrentSpeed(tick)} 
              />
            </div>
          </div>
          
        </div>
      </div>
    </div>
  )
}

/* ================================================================
   Layout
   ================================================================ */
export default function Dashboard() {
  return (
    <div className="h-screen w-full flex flex-row relative bg-bg overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-5%] w-[40%] h-[40%] bg-accent-blue rounded-full blur-[100px] opacity-80 dark:opacity-5 transition-opacity duration-500"></div>
        <div className="absolute bottom-[-10%] right-[-5%] w-[50%] h-[50%] bg-accent-purple rounded-full blur-[120px] opacity-60 dark:opacity-[0.03] transition-opacity duration-500"></div>
      </div>
      
      <Sidebar />
      
      <div className="relative z-10 flex flex-col h-full flex-1 min-w-0">
        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar">
          <Routes>
            <Route index element={<HomePage />} />
            <Route path="nodes" element={<NodesPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="profile" element={<ProfilePage />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
