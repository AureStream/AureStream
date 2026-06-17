import { useState, useEffect, useCallback, useRef } from "react"
import { useTranslation } from "react-i18next"
import { Routes, Route, NavLink, useNavigate } from "react-router-dom"
import SubscriptionPage from "./SubscriptionPage"
import NodesPage from "./NodesPage"
import ProfilePage from "./ProfilePage"
import SettingsPage from "./SettingsPage"
import CheckoutPage from "./CheckoutPage"
import { type ProxyMode } from "./ModeSelector"
import { useTheme } from "./ThemeProvider"
import { useAuth } from "../contexts/AuthContext"
import { fetchSubscriptions, type Subscription } from "../api/subscriptions"
import TrafficGraph from "./TrafficGraph"
import { getEngineState, startEngine, stopEngine } from "../utils/vpn-service"
import { mergeConnectionConfig } from "../lib/connection-config"
import { getConfigJsonPath } from "../lib/app-paths"
import { getEnableTun, setEnableTun, getStoreValue } from "../single/store"
import { SSI_STORE_KEY } from "../types/definition"
import { insertSubscription, getSubscriptionConfig, getLocalSubscriptions } from "../action/db"
import { syncActiveConnectionConfig } from "../lib/config-sync"

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
   Top Navigation
   ================================================================ */
function TopNav() {
  const { i18n } = useTranslation()
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const { user, logout } = useAuth()
  const l = (en: string, zh: string) => i18n.language.startsWith('zh') ? zh : en;

  const navLinks = [
    { to: "/dashboard", label: l("Dashboard", "首页"), end: true },
    { to: "/dashboard/nodes", label: l("Nodes", "节点") },
    { to: "/dashboard/subscription", label: l("Subscription", "套餐") },
    { to: "/dashboard/settings", label: l("Settings", "设置") },
  ]

  return (
    <div className="px-4 md:px-6 pt-3 pb-1 w-full max-w-[1400px] mx-auto relative z-20">
      <div className="flex flex-col md:flex-row items-center justify-between py-2.5 px-4 md:px-6 border border-border bg-surface/80 backdrop-blur-3xl shadow-glass rounded-[28px]">
        
        {/* Brand & Logo */}
        <div className="flex items-center gap-2 mb-2 md:mb-0 w-full md:w-auto px-4 md:px-0 justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-text-inverse shadow-sm ring-1 ring-border-glass">
              <I.Rocket />
            </div>
            <span className="font-heading font-bold text-lg text-text">AureStream</span>
          </div>
        </div>

        {/* Navigation Links - Scrollable horizontally on mobile */}
        <nav className="flex items-center gap-2 bg-surface-active/50 p-1.5 rounded-3xl border border-border-glass shadow-sm max-w-full overflow-x-auto no-scrollbar">
          {navLinks.map(link => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) => 
                `px-5 py-1.5 rounded-2xl text-sm font-semibold transition-all whitespace-nowrap ${isActive ? 'glass-active-pill' : 'text-text-secondary hover:text-text hover:bg-surface-active/60'}`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-3 justify-end pr-1 min-w-0">
          <button onClick={toggleTheme} className="text-text-secondary hover:text-primary transition-colors shrink-0">
            {theme === 'dark' ? <I.Moon /> : <I.Sun />}
          </button>
          <button className="text-text-secondary hover:text-primary transition-colors relative shrink-0">
            <I.Bell />
            <span className="absolute -top-1 -right-0.5 w-2 h-2 rounded-full bg-danger border-2 border-surface"></span>
          </button>
          <div className="w-px h-6 bg-border-glass mx-2 shrink-0 hidden sm:block"></div>
          {/* User Profile & Logout */}
          <div className="flex items-center gap-2 shrink-0">
            <NavLink 
              to="/dashboard/profile"
              className={({ isActive }) => `flex items-center gap-2.5 py-1 px-2 rounded-2xl transition-colors ${isActive ? 'bg-surface-active/80 shadow-sm ring-1 ring-border-glass' : 'hover:bg-surface-active/40'}`}
            >
              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-primary to-accent-purple p-[2px] shrink-0">
                <div className="w-full h-full rounded-full bg-surface flex items-center justify-center overflow-hidden border border-surface">
                  <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(user?.email ?? "U")}&background=0D8ABC&color=fff`} alt="User" className="w-full h-full object-cover" />
                </div>
              </div>
            </NavLink>

            <button
              onClick={() => logout().then(() => navigate('/login'))}
              className="text-text-muted hover:text-danger hover:bg-danger/10 p-2 rounded-full transition-colors shrink-0"
              title={l("Logout", "退出系统")}
            >
              <I.Logout />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ================================================================
   Home Page - Proxy Focused Layout
   ================================================================ */
function HomePage() {
  const { i18n } = useTranslation()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [proxyMode, setProxyMode] = useState<ProxyMode>("rule")
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    const initMode = async () => {
      const tun = await getEnableTun()
      setProxyMode(tun ? "tun" : "rule")
    }
    initMode()
  }, [])
  const [isConnecting, setIsConnecting] = useState(false)
  const [activeNodeId, setActiveNodeId] = useState<string>("")
  const [nodes, setNodes] = useState<any[]>([])

  const [startTime, setStartTime] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  const [currentSpeed, setCurrentSpeed] = useState({ up: 0, down: 0 })
  const isFirstPollRef = useRef(true)

  const [subs, setSubs] = useState<Subscription[]>([])
  const [subsLoading, setSubsLoading] = useState(true)
  const [isUpdatingSub, setIsUpdatingSub] = useState(false)

  const l = (en: string, zh: string) => i18n.language.startsWith('zh') ? zh : en;

  // Poll engine state
  useEffect(() => {
    let active = true
    const checkState = async () => {
      try {
        const state = await getEngineState()
        if (!active) return
        if (state.kind === "running") {
          setIsConnected(true)
          setIsConnecting(false)
          if (state.since) {
            if (isFirstPollRef.current) {
              setStartTime(state.since * 1000)
            } else {
              setStartTime(prev => prev || Date.now())
            }
          }
        } else if (state.kind === "starting") {
          setIsConnected(false)
          setIsConnecting(true)
          setStartTime(null)
        } else if (state.kind === "stopping") {
          setIsConnected(false)
          setIsConnecting(true)
          setStartTime(null)
        } else {
          setIsConnected(false)
          setIsConnecting(false)
          setStartTime(null)
        }
        isFirstPollRef.current = false
      } catch {
        // ignore
      }
    }
    checkState()
    const timer = setInterval(checkState, 1000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [])

  const handleToggleConnection = async () => {
    if (isConnecting) return
    try {
      if (isConnected) {
        setIsConnecting(true)
        await stopEngine()
      } else {
        setIsConnecting(true)
        const subId = (await getStoreValue(SSI_STORE_KEY)) || (subs[0]?.id ?? "")
        const isTun = proxyMode === "tun"
        
        await mergeConnectionConfig(subId, "rule", isTun, { force: true })
        const configPath = await getConfigJsonPath()
        
        await startEngine(configPath, isTun ? "IntoProxy" : "SystemProxy")
      }
    } catch (err) {
      console.error("Toggle connection failed:", err)
      setIsConnecting(false)
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
  const recentNodes = allNodes.slice(0, 3)
  const currentNode = allNodes.find(n => n.id === activeNodeId)

  const hour = new Date().getHours()
  const greetingEn = hour < 12 ? 'Good morning,' : hour < 18 ? 'Good afternoon,' : 'Good evening,'
  const greetingZh = hour < 12 ? '早上好，' : hour < 18 ? '下午好，' : '晚上好，'

  return (
    <div className="flex flex-col gap-4 w-full max-w-[1400px] mx-auto animate-fade-in px-4 md:px-6 pb-2">
      
      {/* Hero Welcome Banner */}
      <div className="relative overflow-hidden rounded-[20px] bg-surface/60 backdrop-blur-2xl border border-border-glass shadow-sm py-4 px-6 mt-1 flex flex-col md:flex-row items-center justify-between">

        <div className="relative z-10 flex flex-col items-start">
          {/* Status Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-0.5 rounded-full bg-surface-active/60 border border-border-glass mb-2 shadow-sm backdrop-blur-md">
             <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
             <span className="text-[11px] font-medium text-text-secondary">{l("System Operational", "系统核心引擎正常")}</span>
          </div>
          
          <h1 className="text-2xl font-heading font-bold tracking-tight text-text mb-1">
            {l(greetingEn, greetingZh)} {user?.email?.split('@')[0] ?? 'User'} <span className="inline-block origin-bottom-right hover:rotate-12 transition-transform cursor-default">👋</span>
          </h1>
          <p className="text-text-secondary text-[14px] max-w-lg leading-normal">
            {isConnected ? l("Your traffic is currently routed through an encrypted tunnel.", "您的网络正由加密隧道接管，全域流量已受到最高级别保护。") : l("System is ready. Enable proxy service to secure your network.", "所有节点与安全策略已准备就绪，请开启代理服务以接管网络。")}
          </p>
        </div>

        {/* Date & Time Display */}
        <div className="relative z-10 hidden md:flex flex-col items-end text-right pr-2">
          <div className="text-[28px] leading-none font-light font-mono text-text tracking-tighter mb-1.5">
            {new Date().toLocaleTimeString(i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className="text-[12px] text-text-muted font-medium bg-surface-active/30 px-2.5 py-0.5 rounded-lg border border-border-glass">
            {new Date().toLocaleDateString(i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US', { month: 'long', day: 'numeric', weekday: 'long' })}
          </div>
        </div>
      </div>

      {/* Main Grid area */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        
        {/* 1. Core Control Card (Refined without circular button) */}
        <div className="md:col-span-5 rounded-[20px] p-4 shadow-glass relative flex flex-col justify-between bg-surface backdrop-blur-xl border border-border">

          
          {/* Status Header */}
          <div className="flex justify-between items-center z-10 w-full mb-3">
            <h2 className="text-lg font-heading font-medium text-text">{l("Connection", "连接状态")}</h2>
            <div className="flex items-center gap-3">
              <div className={`px-4 py-1.5 rounded-full text-xs font-semibold flex items-center gap-2 transition-colors ${isConnected ? 'bg-success/10 text-success' : 'bg-primary/5 text-text-secondary'}`}>
                <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-success animate-pulse' : 'bg-text-secondary'}`}></span>
                {isConnected ? l("Secured", "已连接") : l("Disconnected", "已断开")}
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col gap-3 z-10">
            {/* Master Toggle Switch */}
            <div className="bg-surface-active/50 backdrop-blur-md border border-border-glass rounded-2xl p-4 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${isConnected ? 'bg-success/20 text-success' : 'bg-text-muted/10 text-text-muted'}`}>
                  <I.Shield />
                </div>
                <div>
                  <h3 className="font-heading font-bold text-base text-text">{l("Proxy Service", "代理服务")}</h3>
                  <p className="text-[11px] text-text-muted">{isConnected ? l('Traffic is being routed safely', '流量正在安全路由') : l('Service is currently paused', '服务已暂停')}</p>
                </div>
              </div>
              <button 
                onClick={handleToggleConnection} 
                disabled={isConnecting}
                className={`w-14 h-8 rounded-full relative transition-all duration-300 shadow-inner ${isConnected ? 'bg-success' : 'bg-text-muted/30'} ${isConnecting ? 'opacity-85 cursor-wait' : ''}`}
              >
                <div className={`w-6 h-6 rounded-full bg-white absolute top-1 shadow-md flex items-center justify-center transition-all duration-300 ${isConnected ? 'right-1' : 'left-1'}`}>
                  {isConnecting && (
                    <svg className="animate-spin h-3.5 w-3.5 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  )}
                </div>
              </button>
            </div>

            {/* Active Route Display */}
            <div className="bg-surface-active/30 backdrop-blur-md border border-border-glass rounded-2xl p-4 flex flex-col justify-between relative overflow-hidden group hover:bg-surface-active/50 transition-colors h-[115px]">
              {/* Decorative map dots background */}
              <div className="absolute -right-6 -bottom-6 opacity-10 dark:opacity-20 pointer-events-none text-primary">
                 <div className="absolute inset-0 scale-[5]"><I.Globe /></div>
              </div>
              
              <div className="flex items-center justify-between relative z-10 w-full gap-4 h-full">
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-medium text-text-secondary flex items-center gap-2 mb-1.5 shrink-0">
                    <I.Network /> {l("Active Route", "当前路由")}
                  </div>
                  <h3 className="text-base font-heading font-semibold text-text truncate max-w-full" title={isConnected && currentNode ? currentNode.loc : ""}>
                    {isConnected && currentNode ? currentNode.loc : l("Select a Node", "暂未连接节点")}
                  </h3>
                  <p className="text-xs text-text-muted mt-1 truncate max-w-full">
                    {isConnected && currentNode 
                      ? `${currentNode.protocol || 'Shadowsocks'} · Ping: ${currentNode.ping}` 
                      : l("Please select a node to connect", "请选择一个节点以建立连接")}
                  </p>
                </div>
                
                <div className="flex flex-col items-end shrink-0 justify-center h-full border-l border-border-glass/40 pl-4 min-w-[90px]">
                  <span className="text-[10px] text-text-muted font-medium mb-0.5">{l("Duration", "已连接时间")}</span>
                  <span className={`text-lg font-mono font-bold tracking-wider tabular-nums ${isConnected ? 'text-success' : 'text-text-muted/40'}`}>
                    {isConnected && startTime ? formatTime(now - startTime) : "00:00:00"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Smart / TUN Mode Split Cards */}
          <div className="z-10 w-full mt-3 grid grid-cols-2 gap-2.5">
            <button
              onClick={async () => { setProxyMode('rule'); await setEnableTun(false); }}
              className={`flex flex-col gap-1.5 py-3 px-4 rounded-[20px] transition-all text-left ${proxyMode === 'rule' ? 'bg-white dark:bg-white/10 border-2 border-primary/20 dark:border-white/20 shadow-md scale-[1.02] z-10' : 'bg-surface-active/30 border-2 border-transparent text-text-secondary hover:bg-surface-active/60 scale-[0.98]'}`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${proxyMode === 'rule' ? 'bg-text dark:bg-white text-white dark:text-bg shadow-sm' : 'bg-surface-active text-text-secondary'}`}>
                <I.Activity />
              </div>
              <div>
                <div className="text-sm font-bold font-heading">{l("Smart Routing", "智能分流模式")}</div>
                <div className={`text-[11px] mt-0.5 ${proxyMode === 'rule' ? 'text-text-muted dark:text-white/70' : 'text-text-muted'}`}>{l("System Proxy · Rule-based", "系统代理 · 按规则分流")}</div>
              </div>
            </button>

            <button
              onClick={async () => { setProxyMode('tun' as ProxyMode); await setEnableTun(true); }}
              className={`flex flex-col gap-1.5 py-3 px-4 rounded-[20px] transition-all text-left ${proxyMode === 'tun' ? 'bg-white dark:bg-white/10 border-2 border-primary/20 dark:border-white/20 shadow-md scale-[1.02] z-10' : 'bg-surface-active/30 border-2 border-transparent text-text-secondary hover:bg-surface-active/60 scale-[0.98]'}`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${proxyMode === 'tun' ? 'bg-text dark:bg-white text-white dark:text-bg shadow-sm' : 'bg-surface-active text-text-secondary'}`}>
                <I.Globe />
              </div>
              <div>
                <div className="text-sm font-bold font-heading">{l("Virtual Gateway", "虚拟网关模式")}</div>
                <div className={`text-[11px] mt-0.5 ${proxyMode === 'tun' ? 'text-text-muted dark:text-white/70' : 'text-text-muted'}`}>{l("TUN Mode · Route all traffic", "TUN 模式 · 接管所有流量")}</div>
              </div>
            </button>
          </div>
        </div>

        {/* Right Side Column */}
        <div className="md:col-span-7 flex flex-col gap-4 w-full">
          
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full min-h-[185px]">
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
                   <div className="flex items-center gap-2 text-xs text-text-secondary"><I.Info /> {l("Current IP", "当前 IP")}</div>
                   <div className="text-xs font-mono font-medium">{isConnected ? '103.24.5.11' : l('Local', '本地网络')}</div>
                 </div>
                 <div className="flex justify-between items-center bg-surface-active/50 border border-border-glass rounded-xl px-3.5 py-2">
                   <div className="text-xs text-text-secondary">{l("Expire Date", "到期时间")}</div>
                   <div className="text-xs font-medium">
                     {subs.length > 0 ? new Date(subs[0].expire_time * 1000).toLocaleDateString() : "--"}
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

            {/* Quick Nodes (Fixed overflow by limiting to top 3 and adding View All button) */}
            <div className="bg-surface backdrop-blur-xl border border-border rounded-[20px] p-4 shadow-glass flex flex-col text-text">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-base font-heading font-medium">{l("Recent Nodes", "近期节点")}</h3>
                <span className="text-xs font-medium bg-primary/5 text-primary px-2 py-1 rounded-md">{allNodes.length} {l("Total", "个节点")}</span>
              </div>

              {/* Limited List, no internal scrolling */}
              <div className="flex flex-col gap-2 flex-1 justify-center">
                {recentNodes.length > 0 ? (
                  recentNodes.map((node) => (
                    <div 
                      key={node.id} 
                      onClick={() => { setActiveNodeId(node.id); setIsConnected(true); }}
                      className={`flex items-center gap-2.5 p-2 rounded-[16px] transition-all cursor-pointer border ${node.active ? 'bg-success/5 border-success/50 shadow-sm scale-[1.02]' : 'bg-surface-active/30 border-border-glass hover:bg-surface-active/60'}`}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${node.active ? 'bg-success text-bg shadow-md' : 'bg-bg text-text shadow-sm border border-border-glass'}`}>
                        <I.Globe />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{node.loc}</div>
                        <div className="text-[11px] font-mono text-text-muted">{node.ping}</div>
                      </div>
                      <div className="shrink-0">
                        {node.active ? <I.CheckCircle /> : null}
                      </div>
                    </div>
                  ))
                ) : (
                  [1, 2, 3].map((idx) => (
                    <div 
                      key={idx}
                      className="flex items-center gap-2.5 p-2 rounded-[16px] border border-border-glass/40 bg-surface-active/10 opacity-60 animate-pulse h-[50px]"
                    >
                      <div className="w-8 h-8 rounded-full bg-surface-active shrink-0"></div>
                      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                        <div className="h-3 bg-surface-active rounded w-3/4"></div>
                        <div className="h-2 bg-surface-active rounded w-1/4"></div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              
              {/* View All Button */}
              <button 
                onClick={() => navigate('/dashboard/nodes')}
                className="mt-2.5 w-full py-2 rounded-xl border border-border bg-surface-active/50 hover:bg-surface-active text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm text-text-secondary hover:text-text"
              >
                {l("View All Nodes", "查看所有节点")} <I.ArrowRight />
              </button>
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
    <div className="h-screen w-full flex flex-col relative bg-bg overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-5%] w-[40%] h-[40%] bg-accent-blue rounded-full blur-[100px] opacity-80 dark:opacity-5 transition-opacity duration-500"></div>
        <div className="absolute bottom-[-10%] right-[-5%] w-[50%] h-[50%] bg-accent-purple rounded-full blur-[120px] opacity-60 dark:opacity-[0.03] transition-opacity duration-500"></div>
      </div>
      
      <div className="relative z-10 flex flex-col h-full">
        <TopNav />
        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar">
          <Routes>
            <Route index element={<HomePage />} />
            <Route path="nodes" element={<NodesPage />} />
            <Route path="subscription" element={<SubscriptionPage />} />
            <Route path="checkout" element={<CheckoutPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="profile" element={<ProfilePage />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
