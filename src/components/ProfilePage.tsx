import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../contexts/AuthContext"
import { getLocalSubscriptions } from "../action/db"
import { type as osType, version as osVersion, arch as osArch, hostname as osHostname } from "@tauri-apps/plugin-os"

/* ── Icons ── */
const I = {
  User: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>),
  Shield: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>),
  Smartphone: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>),
  Monitor: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>),
  Key: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/></svg>),
  Mail: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>),
  Crown: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="2 15 7 22 17 22 22 15 17 9 12 15 7 9 2 15"/></svg>),
  LogOut: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>),
  DeviceOffline: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/><line x1="1" y1="1" x2="23" y2="23"/></svg>),
}

export default function ProfilePage() {
  const { i18n } = useTranslation()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const l = (en: string, zh: string) => i18n.language.startsWith('zh') ? zh : en;

  const emailUser = user?.email ?? "User";
  const displayName = emailUser.split('@')[0];
  const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(emailUser)}&background=5C67F2&color=fff`;

  // Real current device info (this machine), fetched via the OS plugin.
  type DeviceInfo = { name: string; os: string; mobile: boolean }
  const [currentDevice, setCurrentDevice] = useState<DeviceInfo | null>(null)

  const [subs, setSubs] = useState<any[]>([])

  useEffect(() => {
    const loadSubsData = async () => {
      try {
        const localData = await getLocalSubscriptions()
        if (localData && localData.length > 0) {
          setSubs(localData)
        }
      } catch (e) {
        console.error("Failed to load subscription in profile page:", e)
      }
    }
    loadSubsData()

    const loadDevice = async () => {
      try {
        const t = osType()
        const prettyOs: Record<string, string> = {
          macos: "macOS", windows: "Windows", linux: "Linux", ios: "iOS", android: "Android",
        }
        let ver = ""
        let ar = ""
        try { ver = osVersion() } catch { /* ignore */ }
        try { ar = osArch() } catch { /* ignore */ }
        let host: string | null = null
        try { host = await osHostname() } catch { /* ignore */ }

        const osName = prettyOs[t] || t
        const parts = [osName, ver].filter(Boolean).join(" ")
        setCurrentDevice({
          name: host || osName,
          os: ar ? `${parts} · ${ar}` : parts,
          mobile: t === "ios" || t === "android",
        })
      } catch (e) {
        console.error("Failed to load device info:", e)
      }
    }
    loadDevice()
  }, [])

  // Calculate dynamic subscription details
  const hasSub = subs.length > 0
  const subName = hasSub ? subs[0].name : l("No Active Plan", "暂无可用套餐")
  const expireDate = hasSub && subs[0].expire_time
    ? new Date(subs[0].expire_time * 1000).toLocaleDateString(i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : l("Never Expire", "永久有效")
  
  const trafficUsed = hasSub ? subs[0].traffic_used : 0
  const trafficTotal = hasSub ? subs[0].traffic_total : 0
  const trafficUsedGB = (trafficUsed / (1024 * 1024 * 1024)).toFixed(2)
  const trafficTotalGB = (trafficTotal / (1024 * 1024 * 1024)).toFixed(0)
  const percentUsed = trafficTotal > 0 ? Math.min(100, Math.round((trafficUsed / trafficTotal) * 100)) : 0

  return (
    <div className="flex flex-col gap-4 w-full h-full max-w-[1300px] mx-auto animate-fade-in px-8 pt-7 pb-5 overflow-hidden">
      
      {/* Bento Box Grid (No Header) */}
      <div className="grid grid-cols-12 gap-5 items-stretch flex-1 min-h-0">
        
        {/* Left Column (5 cols) - User card */}
        <div className="col-span-5 glass-card rounded-[28px] p-5 shadow-glass flex flex-col justify-between h-full min-h-0">
          
          <div className="flex flex-col items-center justify-center pt-8 text-center">
            {/* Avatar Container */}
            <div className="w-20 h-20 rounded-full bg-secondary p-[3px] shadow-glow-primary mb-4 animate-pulse-slow">
              <div className="w-full h-full rounded-full bg-surface flex items-center justify-center overflow-hidden">
                <img src={avatarUrl} alt="User" className="w-full h-full aspect-square shrink-0 object-cover" />
              </div>
            </div>

            <h2 className="font-heading font-extrabold text-text text-xl leading-tight tracking-tight">{displayName}</h2>
            
            <div className="text-[10px] text-secondary bg-secondary/10 border border-secondary/15 px-3 py-1 rounded-full font-bold inline-flex items-center gap-1.5 mt-2.5">
              <I.Crown /> {hasSub ? l("Premium Pro Client", "专业版尊享用户") : l("Free Tier Client", "免费体验用户")}
            </div>

            <div className="w-full h-px bg-border-glass/40 my-6"></div>

            {/* Email field */}
            <div className="w-full px-3 text-left">
              <span className="text-[10px] font-extrabold text-text-muted uppercase tracking-wider">{l("Registered Email", "绑定邮箱")}</span>
              <div className="flex items-center gap-2.5 mt-2 bg-surface-active/15 border border-border-glass/30 rounded-xl px-3.5 py-2.5">
                <span className="text-text-secondary"><I.Mail /></span>
                <span className="text-xs font-bold text-text truncate select-all">{emailUser}</span>
              </div>
            </div>

            {/* Password security state */}
            <div className="w-full px-3 text-left mt-4">
              <span className="text-[10px] font-extrabold text-text-muted uppercase tracking-wider">{l("Security Status", "安全保护")}</span>
              <div className="flex items-center gap-2.5 mt-2 bg-surface-active/15 border border-border-glass/30 rounded-xl px-3.5 py-2.5">
                <span className="text-text-secondary"><I.Key /></span>
                <span className="text-xs font-semibold text-text truncate">{l("Password Protected", "双重密码加密验证中")}</span>
              </div>
            </div>
          </div>

          <button 
            onClick={() => logout().then(() => navigate('/login'))}
            className="w-full py-4 rounded-[20px] bg-gradient-to-r from-secondary to-accent-purple hover:opacity-95 active:scale-[0.98] transition-all text-white font-extrabold shadow-md mt-6 text-[15px] cursor-pointer uppercase tracking-wider flex items-center justify-center gap-2"
          >
            <I.LogOut /> {l("Log Out of Session", "安全退出登录")}
          </button>
        </div>

        {/* Right Column (7 cols) - Subscription details & Active devices */}
        <div className="col-span-7 flex flex-col gap-5 h-full min-h-0">
          
          {/* Card 2: Current Subscription Status */}
          <div className="glass-card rounded-[28px] p-5 shadow-glass flex flex-col justify-between flex-1 min-h-0 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-tr from-secondary/5 to-accent-purple/5 pointer-events-none z-0" />
            
            <div className="relative z-10 flex flex-col h-full justify-between">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-secondary"><I.Shield /></span>
                  <h3 className="text-sm font-extrabold text-text uppercase tracking-wider">{l("Subscription Plan details", "专属套餐额度信息")}</h3>
                </div>
                
                <div className="flex justify-between items-start my-4">
                  <div>
                    <div className="text-2xl font-extrabold tracking-tight text-text">{subName}</div>
                    <div className="text-[10px] text-text-muted mt-1">{l("Service Expiry Date", "服务重置与到期时间")}：{expireDate}</div>
                  </div>
                  <span className={`px-2.5 py-1 text-[9px] font-extrabold rounded-lg tracking-wider shadow-sm select-none uppercase ${
                    hasSub ? "bg-secondary text-white" : "bg-text-muted/15 text-text-muted"
                  }`}>
                    {hasSub ? l("Active Service", "服务生效中") : l("Expired / None", "套餐未激活")}
                  </span>
                </div>
              </div>

              {/* Progress bar container */}
              <div className="bg-surface-active/15 border border-border-glass/40 rounded-2xl p-4.5 mt-2">
                <div className="flex justify-between items-end mb-3">
                  <div>
                    <div className="text-[10px] text-text-muted mb-1 font-bold">{l("DATA CONSUMED", "已用高速流量")}</div>
                    <div className="text-2xl font-extrabold font-mono tracking-tight text-text">{trafficUsedGB} <span className="text-xs text-text-muted font-bold">GB</span></div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-text-muted mb-1 font-bold">{l("TOTAL LIMIT", "总流量额度")}</div>
                    <div className="text-lg font-bold font-mono tracking-tight text-text">{hasSub ? trafficTotalGB : "--"} <span className="text-[10px] text-text-muted font-bold">GB</span></div>
                  </div>
                </div>
                <div className="w-full h-2 rounded-full bg-border-glass overflow-hidden mt-3 shadow-inner">
                  <div className="h-full rounded-full bg-secondary shadow-glow-primary" style={{ width: `${percentUsed}%` }}></div>
                </div>
                {hasSub && (
                  <div className="flex justify-end text-[9px] text-text-muted mt-1.5 font-semibold">
                    {percentUsed}% {l("used", "已使用")}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Card 3: Connected Devices */}
          <div className="glass-card rounded-[28px] p-5 shadow-glass flex flex-col justify-between flex-1 min-h-0">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-success"><I.Monitor /></span>
                  <h3 className="text-sm font-extrabold text-text uppercase tracking-wider">{l("Connected Sessions", "在线终端设备管理")}</h3>
                </div>
                <span className="px-2 py-0.5 text-[9px] font-bold bg-success/15 text-success rounded-lg border border-success/10">{currentDevice ? 1 : 0} {l("Active", "台设备在线")}</span>
              </div>
              <p className="text-[11px] text-text-muted leading-relaxed">{l("Your current device session. Other terminals can be managed for account safety.", "当前正在使用的终端设备信息，保障网络及账号安全。")}</p>
            </div>

            <div className="flex flex-col gap-2.5 flex-1 justify-center my-3 overflow-y-auto no-scrollbar pr-0.5">
              {currentDevice ? (
                <div className="flex items-center justify-between p-3 rounded-2xl bg-surface-active/10 border border-border-glass/30">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border bg-success/10 border-success/20 text-success">
                      {currentDevice.mobile ? <I.Smartphone /> : <I.Monitor />}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-text text-xs truncate" title={currentDevice.name}>{currentDevice.name}</div>
                      <div className="text-[10px] text-text-muted flex items-center gap-1.5 mt-0.5 font-semibold truncate">
                        <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse shrink-0"></span>
                        {l("Connected Now", "当前在线")} · {currentDevice.os}
                      </div>
                    </div>
                  </div>
                  <span className="shrink-0 px-3 py-1.5 text-[10px] font-bold text-secondary bg-secondary/10 border border-secondary/15 rounded-xl">
                    {l("This Device", "本机")}
                  </span>
                </div>
              ) : (
                <div className="text-center py-4 flex flex-col items-center justify-center gap-2 text-text-muted animate-fade-in">
                  <I.DeviceOffline />
                  <span className="text-xs font-bold">{l("Detecting device...", "正在获取设备信息...")}</span>
                </div>
              )}
            </div>
          </div>
          
        </div>

      </div>
    </div>
  )
}
