import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { Routes, Route, NavLink, useNavigate } from "react-router-dom"
import SubscriptionPage from "./SubscriptionPage"
import NodesPage from "./NodesPage"
import ProfilePage from "./ProfilePage"
import SettingsPage from "./SettingsPage"
import CheckoutPage from "./CheckoutPage"
import { type ProxyMode } from "./ModeSelector"
import { useTheme } from "./ThemeProvider"
import TrafficGraph from "./TrafficGraph"

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
}

/* ================================================================
   Top Navigation
   ================================================================ */
function TopNav() {
  const { i18n } = useTranslation()
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const l = (en: string, zh: string) => i18n.language.startsWith('zh') ? zh : en;

  const navLinks = [
    { to: "/dashboard", label: l("Dashboard", "首页"), end: true },
    { to: "/dashboard/nodes", label: l("Nodes", "节点") },
    { to: "/dashboard/subscription", label: l("Subscription", "套餐") },
    { to: "/dashboard/settings", label: l("Settings", "设置") },
  ]

  return (
    <div className="px-4 md:px-8 pt-6 pb-2 w-full max-w-[1400px] mx-auto relative z-20">
      <div className="flex flex-col lg:flex-row items-center justify-between py-4 px-4 md:px-8 border border-border bg-surface/80 backdrop-blur-3xl shadow-glass rounded-[28px]">
        
        {/* Brand & Logo */}
        <div className="flex items-center gap-2 mb-2 lg:mb-0 w-full lg:w-auto px-4 lg:px-0 justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white shadow-sm ring-1 ring-border-glass">
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
                `px-6 py-2.5 rounded-2xl text-sm font-semibold transition-all whitespace-nowrap ${isActive ? 'glass-active-pill' : 'text-text-secondary hover:text-text hover:bg-surface-active/60'}`
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
                  <img src="https://ui-avatars.com/api/?name=User&background=0D8ABC&color=fff" alt="User" className="w-full h-full object-cover" />
                </div>
              </div>
            </NavLink>

            <button 
              onClick={() => navigate('/')} 
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
  const navigate = useNavigate()
  const [proxyMode, setProxyMode] = useState<ProxyMode>("rule")
  const [isConnected, setIsConnected] = useState(false)
  const [activeNodeId, setActiveNodeId] = useState<number>(1)
  
  const [startTime, setStartTime] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  
  const l = (en: string, zh: string) => i18n.language.startsWith('zh') ? zh : en;

  useEffect(() => {
    if (isConnected) setStartTime(prev => prev || Date.now())
    else setStartTime(null)
  }, [isConnected])

  useEffect(() => {
    if (!isConnected) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [isConnected])

  const formatTime = (ms: number) => {
    const totalSec = Math.floor(ms / 1000)
    const h = Math.floor(totalSec / 3600).toString().padStart(2, '0')
    const m = Math.floor((totalSec % 3600) / 60).toString().padStart(2, '0')
    const s = (totalSec % 60).toString().padStart(2, '0')
    return `${h}:${m}:${s}`
  }

  // Mock nodes data
  const allNodes = [
    { id: 1, loc: l("Tokyo, JP - Premium", "日本 东京 - 专线"), ping: "45ms" },
    { id: 2, loc: l("Singapore, SG - Optim", "新加坡 - 优化"), ping: "62ms" },
    { id: 3, loc: l("Los Angeles, US", "美国 洛杉矶"), ping: "140ms" },
    { id: 4, loc: l("London, UK", "英国 伦敦"), ping: "210ms" },
    { id: 5, loc: l("Hong Kong, HK", "中国 香港"), ping: "55ms" },
  ].map(n => ({ ...n, active: isConnected && n.id === activeNodeId }))

  // Only show top 3 on dashboard to prevent overflow clutter
  const recentNodes = allNodes.slice(0, 3)
  const currentNode = allNodes.find(n => n.id === activeNodeId)

  const hour = new Date().getHours()
  const greetingEn = hour < 12 ? 'Good morning,' : hour < 18 ? 'Good afternoon,' : 'Good evening,'
  const greetingZh = hour < 12 ? '早上好，' : hour < 18 ? '下午好，' : '晚上好，'

  return (
    <div className="flex flex-col gap-6 w-full max-w-[1400px] mx-auto animate-fade-in px-4 md:px-8 pb-12">
      
      {/* Hero Welcome Banner */}
      <div className="relative overflow-hidden rounded-[32px] bg-surface/60 backdrop-blur-2xl border border-border-glass shadow-sm p-8 mt-2 flex flex-col md:flex-row items-center justify-between">
        {/* Ambient Glows */}
        <div className="absolute -left-24 -top-24 w-72 h-72 bg-primary/20 blur-[100px] rounded-full pointer-events-none"></div>
        <div className="absolute -right-10 -bottom-10 w-80 h-80 bg-accent-blue/15 blur-[100px] rounded-full pointer-events-none"></div>
        
        <div className="relative z-10 flex flex-col items-start">
          {/* Status Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-active/60 border border-border-glass mb-4 shadow-sm backdrop-blur-md">
             <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
             <span className="text-xs font-medium text-text-secondary">{l("System Operational", "系统核心引擎正常")}</span>
          </div>
          
          <h1 className="text-[32px] font-heading font-bold tracking-tight text-text mb-2">
            {l(greetingEn, greetingZh)} User <span className="inline-block origin-bottom-right hover:rotate-12 transition-transform cursor-default">👋</span>
          </h1>
          <p className="text-text-secondary text-[15px] max-w-lg leading-relaxed">
            {isConnected ? l("Your traffic is currently routed through an encrypted tunnel.", "您的网络正由加密隧道接管，全域流量已受到最高级别保护。") : l("System is ready. Enable proxy service to secure your network.", "所有节点与安全策略已准备就绪，请开启代理服务以接管网络。")}
          </p>
        </div>

        {/* Date & Time Display */}
        <div className="relative z-10 hidden md:flex flex-col items-end text-right pr-2">
          <div className="text-[40px] leading-none font-light font-mono text-text tracking-tighter mb-2">
            {new Date().toLocaleTimeString(i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className="text-[13px] text-text-muted font-medium bg-surface-active/30 px-3 py-1 rounded-lg border border-border-glass">
            {new Date().toLocaleDateString(i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US', { month: 'long', day: 'numeric', weekday: 'long' })}
          </div>
        </div>
      </div>

      {/* Main Grid area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* 1. Core Control Card (Refined without circular button) */}
        <div className="lg:col-span-5 rounded-[32px] p-6 shadow-glass relative flex flex-col justify-between bg-surface backdrop-blur-xl border border-border min-h-[460px]">
          <div className="absolute top-0 right-0 w-64 h-64 bg-accent-blue rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none opacity-50 dark:opacity-20"></div>
          
          {/* Status Header */}
          <div className="flex justify-between items-center z-10 w-full mb-6">
            <h2 className="text-xl font-heading font-medium text-text">{l("Connection", "连接状态")}</h2>
            <div className="flex items-center gap-3">
              <div className={`px-4 py-1.5 rounded-full text-xs font-semibold flex items-center gap-2 transition-colors ${isConnected ? 'bg-success/10 text-success' : 'bg-primary/5 text-text-secondary'}`}>
                <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-success animate-pulse' : 'bg-text-secondary'}`}></span>
                {isConnected ? l("Secured", "已连接") : l("Disconnected", "未连接")}
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col gap-4 z-10">
            {/* Master Toggle Switch */}
            <div className="bg-surface-active/50 backdrop-blur-md border border-border-glass rounded-3xl p-5 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${isConnected ? 'bg-success/20 text-success' : 'bg-text-muted/10 text-text-muted'}`}>
                  <I.Shield />
                </div>
                <div>
                  <h3 className="font-heading font-bold text-lg text-text">{l("Proxy Service", "代理服务")}</h3>
                  <p className="text-xs text-text-muted">{isConnected ? l('Traffic is being routed safely', '流量正在安全路由') : l('Service is currently paused', '服务已暂停')}</p>
                </div>
              </div>
              <button 
                onClick={() => setIsConnected(!isConnected)} 
                className={`w-14 h-8 rounded-full relative transition-colors shadow-inner ${isConnected ? 'bg-success' : 'bg-text-muted/30'}`}
              >
                <div className={`w-6 h-6 rounded-full bg-white absolute top-1 shadow-md transition-all ${isConnected ? 'right-1' : 'left-1'}`}></div>
              </button>
            </div>

            {/* Active Node Display */}
            <div className="bg-surface-active/30 backdrop-blur-md border border-border-glass rounded-3xl p-5 flex flex-col gap-3 relative overflow-hidden group hover:bg-surface-active/50 transition-colors">
              {/* Decorative map dots background */}
              <div className="absolute -right-6 -bottom-6 opacity-10 dark:opacity-20 pointer-events-none text-primary">
                 <I.Globe />
                 {/* Imagine a huge globe icon here */}
                 <div className="absolute inset-0 scale-[5]"><I.Globe /></div>
              </div>
              
              <div className="flex justify-between items-end relative z-10">
                <div>
                  <div className="text-xs font-medium text-text-secondary flex items-center gap-2 mb-1.5">
                    <I.Network /> {l("Active Route", "当前路由")}
                  </div>
                  <div className="text-xl font-heading font-medium text-text">{isConnected && currentNode ? currentNode.loc.split('-')[0] : l("Select a Node", "选择节点")}</div>
                  <div className="text-sm text-text-muted font-mono mt-1">
                    {isConnected && currentNode ? `${currentNode.loc.includes('-') ? currentNode.loc.split('-')[1].trim() : 'Standard'} · Ping: ${currentNode.ping}` : l("Please select a node to connect", "请选择一个节点进行连接")}
                  </div>
                </div>
                {isConnected && startTime && (
                  <div className="text-3xl font-mono text-success font-bold tracking-wider tabular-nums mb-1">
                    {formatTime(now - startTime)}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Smart / TUN Mode Split Cards */}
          <div className="z-10 w-full mt-4 grid grid-cols-2 gap-3">
            <button
              onClick={() => setProxyMode('rule')}
              className={`flex flex-col gap-2 p-4 rounded-3xl transition-all text-left ${proxyMode === 'rule' ? 'glass-active-pill' : 'bg-surface-active/30 text-text-secondary hover:bg-surface-active/60 scale-[0.98]'}`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${proxyMode === 'rule' ? 'bg-primary text-white shadow-sm' : 'bg-surface-active text-text-secondary'}`}>
                <I.Activity />
              </div>
              <div>
                <div className="text-sm font-bold font-heading">{l("Smart Routing", "智能分流模式")}</div>
                <div className={`text-[11px] mt-0.5 ${proxyMode === 'rule' ? 'text-primary/70' : 'text-text-muted'}`}>{l("Rule-based proxy", "按规则自动代理流量")}</div>
              </div>
            </button>

            <button
              onClick={() => setProxyMode('tun' as ProxyMode)}
              className={`flex flex-col gap-2 p-4 rounded-3xl transition-all text-left ${proxyMode === 'tun' ? 'glass-active-pill' : 'bg-surface-active/30 text-text-secondary hover:bg-surface-active/60 scale-[0.98]'}`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${proxyMode === 'tun' ? 'bg-primary text-white shadow-sm' : 'bg-surface-active text-text-secondary'}`}>
                <I.Globe />
              </div>
              <div>
                <div className="text-sm font-bold font-heading">{l("TUN Mode", "虚拟网卡模式")}</div>
                <div className={`text-[11px] mt-0.5 ${proxyMode === 'tun' ? 'text-primary/70' : 'text-text-muted'}`}>{l("Route all system traffic", "全局接管所有应用流量")}</div>
              </div>
            </button>
          </div>
        </div>

        {/* Right Side Column */}
        <div className="lg:col-span-7 flex flex-col gap-6 w-full">
          
          {/* Realtime Traffic Graph */}
          <div className="bg-surface backdrop-blur-xl border border-border rounded-[32px] p-6 shadow-glass flex flex-col relative h-[220px]">
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-lg font-heading font-medium text-text">{l("Network Traffic", "网络流量")}</h3>
              <div className="flex items-center gap-5 text-sm font-mono bg-surface-active/50 px-4 py-1.5 rounded-full border border-border-glass shadow-sm">
                <div className="flex items-center gap-1.5 text-secondary font-semibold">
                  <I.Download /> {isConnected ? "12.4 MB/s" : "0.0 KB/s"}
                </div>
                <div className="w-px h-4 bg-border"></div>
                <div className="flex items-center gap-1.5 text-success font-semibold">
                  <I.Upload /> {isConnected ? "3.2 MB/s" : "0.0 KB/s"}
                </div>
              </div>
            </div>
            <div className="flex-1 mt-4 -mx-2">
              <TrafficGraph height={140} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full min-h-[220px]">
            {/* Subscriptions & Data Usage (Refilled to avoid empty space) */}
            <div className="bg-surface backdrop-blur-xl border border-border rounded-[32px] p-6 shadow-glass flex flex-col justify-between">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-accent-yellow border border-white/50 flex items-center justify-center text-accent-yellow-text shadow-sm">
                    <I.Shield />
                  </div>
                  <div>
                    <h3 className="font-bold font-heading text-text text-lg leading-tight">{l("Pro Plan", "专业版")}</h3>
                    <p className="text-xs text-text-muted">{l("Premium Access", "高级访问权限")}</p>
                  </div>
                </div>
              </div>
              
              {/* Added more informative metrics to fill whitespace properly */}
              <div className="flex flex-col gap-3 my-auto">
                 <div className="flex justify-between items-center bg-surface-active/50 border border-border-glass rounded-xl px-4 py-2.5">
                   <div className="flex items-center gap-2 text-sm text-text-secondary"><I.Info /> {l("Current IP", "当前 IP")}</div>
                   <div className="text-sm font-mono font-medium">{isConnected ? '103.24.5.11' : l('Local', '本地网络')}</div>
                 </div>
                 <div className="flex justify-between items-center bg-surface-active/50 border border-border-glass rounded-xl px-4 py-2.5">
                   <div className="text-sm text-text-secondary">{l("Reset Date", "重置日期")}</div>
                   <div className="text-sm font-medium">{l("Jul 12, 2026", "2026年7月12日")}</div>
                 </div>
              </div>
              
              <div className="mt-4">
                <div className="flex justify-between items-end mb-2">
                  <div className="text-2xl font-bold font-heading text-text">12.5<span className="text-sm text-text-muted font-medium ml-1">GB</span></div>
                  <div className="text-xs font-semibold text-primary/70 bg-primary/5 px-2 py-1 rounded-md">{l("62% Used", "已使用 62%")}</div>
                </div>
                <div className="w-full h-2 rounded-full bg-border-light overflow-hidden shadow-inner">
                  <div className="h-full rounded-full bg-gradient-to-r from-secondary to-accent-purple" style={{ width: "62%" }} />
                </div>
                <div className="flex justify-between mt-2 text-[11px] font-medium text-text-muted">
                  <span>{l("Current billing cycle", "当前计费周期")}</span>
                  <span>{l("20 GB Total", "总共 20 GB")}</span>
                </div>
              </div>
            </div>

            {/* Quick Nodes (Fixed overflow by limiting to top 3 and adding View All button) */}
            <div className="bg-surface backdrop-blur-xl border border-border rounded-[32px] p-6 shadow-glass flex flex-col text-text">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-heading font-medium">{l("Recent Nodes", "近期节点")}</h3>
                <span className="text-xs font-medium bg-primary/5 text-primary px-2 py-1 rounded-md">{allNodes.length} {l("Total", "个节点")}</span>
              </div>

              {/* Limited List, no internal scrolling */}
              <div className="flex flex-col gap-2.5 flex-1">
                {recentNodes.map((node) => (
                  <div 
                    key={node.id} 
                    onClick={() => { setActiveNodeId(node.id); setIsConnected(true); }}
                    className={`flex items-center gap-3 p-3 rounded-[20px] transition-all cursor-pointer border ${node.active ? 'bg-success/5 border-success/50 shadow-sm scale-[1.02]' : 'bg-surface-active/30 border-border-glass hover:bg-surface-active/60'}`}
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
                ))}
              </div>
              
              {/* View All Button */}
              <button 
                onClick={() => navigate('/dashboard/nodes')}
                className="mt-4 w-full py-3 rounded-xl border border-border bg-surface-active/50 hover:bg-surface-active text-sm font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm text-text-secondary hover:text-text"
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
        <div className="absolute top-[-10%] left-[-5%] w-[40%] h-[40%] bg-accent-blue rounded-full blur-[100px] opacity-80"></div>
        <div className="absolute bottom-[-10%] right-[-5%] w-[50%] h-[50%] bg-accent-purple rounded-full blur-[120px] opacity-60"></div>
      </div>
      
      <div className="relative z-10 flex flex-col h-full">
        <TopNav />
        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto no-scrollbar">
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
