import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useTheme } from "./ThemeProvider"

/* ── Icons ── */
const I = {
  Moon: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>),
  Sun: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>),
  Globe: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>),
  Rocket: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>),
  Bell: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>),
  ShieldOff: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m2 2 20 20"/><path d="M5 5a1 1 0 0 0-1 1v7c0 5 3.5 7.5 7.67 8.94a1 1 0 0 0 .66 0c2.5-1.03 4.67-2.7 5.67-5.94"/><path d="M21 11V5a1 1 0 0 0-1-1l-8-3-8 3"/></svg>),
  Settings: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>),
}

type TabKey = 'general' | 'application' | 'network';

export default function SettingsPage() {
  const { i18n } = useTranslation()
  const { theme, toggleTheme } = useTheme()
  const l = (en: string, zh: string) => i18n.language.startsWith('zh') ? zh : en;

  const [activeTab, setActiveTab] = useState<TabKey>('general')
  const [bypassDomains, setBypassDomains] = useState("localhost, 127.0.0.1, ::1, *.local")
  const [autoConnect, setAutoConnect] = useState(true)
  const [notifications, setNotifications] = useState(false)

  const tabs = [
    { id: 'general', label: l("General", "通用设置"), icon: <I.Settings /> },
    { id: 'application', label: l("Application", "应用行为"), icon: <I.Rocket /> },
    { id: 'network', label: l("Network", "高级网络"), icon: <I.Globe /> },
  ] as const;

  return (
    <div className="w-full max-w-[1000px] mx-auto animate-fade-in px-4 md:px-8 pb-12 pt-8 flex flex-col md:flex-row gap-8 lg:gap-12 relative z-10">
      
      {/* Left Sidebar */}
      <div className="w-full md:w-[260px] shrink-0 flex flex-col gap-8">
        <div className="mb-2">
          <h1 className="text-3xl font-heading font-bold text-text">{l("Settings", "系统设置")}</h1>
          <p className="text-sm text-text-muted mt-2">
            {l("Customize application preferences", "自定义您的应用偏好设置")}
          </p>
        </div>
        
        <nav className="flex flex-col gap-2">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all ${activeTab === tab.id ? 'glass-active-pill' : 'text-text-secondary hover:text-text hover:bg-surface-active/60'}`}
            >
              <span className={`${activeTab === tab.id ? 'text-inherit' : 'text-text-muted'}`}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Right Content Area */}
      <div className="flex-1 min-h-[500px]">
        
        {/* --- GENERAL TAB --- */}
        {activeTab === 'general' && (
          <div className="animate-fade-in flex flex-col gap-6">
            <div>
              <h1 className="text-2xl font-heading font-bold text-text">{l("Appearance & Language", "外观与语言")}</h1>
              <p className="text-sm text-text-muted mt-1">{l("Configure your visual and localization preferences.", "配置您的视觉和本地化偏好。")}</p>
            </div>

            <div className="bg-surface/60 backdrop-blur-2xl border border-border-glass shadow-sm rounded-[24px] overflow-hidden flex flex-col">
              
              <div className="flex items-center justify-between p-4 bg-transparent hover:bg-black/5 dark:hover:bg-white/5 transition-colors border-b border-border-glass">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
                    {theme === "dark" ? <I.Moon /> : <I.Sun />}
                  </div>
                  <div>
                    <div className="font-semibold text-text text-[15px]">{l("Appearance", "外观主题")}</div>
                    <div className="text-xs text-text-muted mt-0.5">{theme === "dark" ? l("Dark mode enabled", "已启用深色模式") : l("Light mode enabled", "已启用浅色模式")}</div>
                  </div>
                </div>
                <button 
                  onClick={toggleTheme}
                  className={`w-12 h-7 rounded-full p-1 transition-colors relative shadow-inner shrink-0 ${theme === 'dark' ? 'bg-primary' : 'bg-border-light dark:bg-black/20'}`}
                >
                  <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform absolute top-1 ${theme === 'dark' ? 'translate-x-5' : 'translate-x-0'}`}></div>
                </button>
              </div>

              {/* Language Row */}
              <div className="flex items-center justify-between p-4 rounded-[24px] bg-transparent hover:bg-surface-active/40 border border-transparent transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
                    <I.Globe />
                  </div>
                  <div>
                    <div className="font-semibold text-text text-[15px]">{l("Language", "语言设置")}</div>
                    <div className="text-xs text-text-muted mt-0.5">{l("Interface language", "应用界面显示语言")}</div>
                  </div>
                </div>
                <div className="flex bg-surface-active/50 rounded-xl p-1 border border-border-glass shadow-inner">
                  <button 
                    onClick={() => i18n.changeLanguage("zh-CN")}
                    className={`px-5 py-2 text-xs font-bold rounded-lg transition-all ${i18n.language.startsWith("zh") ? 'bg-white dark:bg-surface text-text shadow-sm ring-1 ring-border-glass' : 'text-text-muted hover:text-text'}`}
                  >
                    中文
                  </button>
                  <button 
                    onClick={() => i18n.changeLanguage("en")}
                    className={`px-5 py-2 text-xs font-bold rounded-lg transition-all ${!i18n.language.startsWith("zh") ? 'bg-white dark:bg-surface text-text shadow-sm ring-1 ring-border-glass' : 'text-text-muted hover:text-text'}`}
                  >
                    EN
                  </button>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* --- APPLICATION TAB --- */}
        {activeTab === 'application' && (
          <div className="animate-fade-in flex flex-col gap-6">
            <div>
              <h1 className="text-2xl font-heading font-bold text-text">{l("Application Behavior", "应用行为")}</h1>
              <p className="text-sm text-text-muted mt-1">{l("Manage startup and notification settings.", "管理启动和通知相关设置。")}</p>
            </div>

            <div className="bg-surface/60 backdrop-blur-2xl border border-border-glass shadow-sm rounded-[24px] overflow-hidden flex flex-col">
              
              <div className="flex items-center justify-between p-4 bg-transparent hover:bg-black/5 dark:hover:bg-white/5 transition-colors border-b border-border-glass">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-green-500/10 text-green-600 flex items-center justify-center">
                    <I.Rocket />
                  </div>
                  <div>
                    <div className="font-semibold text-text text-[15px]">{l("Auto-Connect on Startup", "启动时自动连接")}</div>
                    <div className="text-xs text-text-muted mt-0.5">{l("Connect to the fastest node when opened", "打开应用时自动连接延迟最低的节点")}</div>
                  </div>
                </div>
                <button 
                  onClick={() => setAutoConnect(!autoConnect)}
                  className={`w-12 h-7 rounded-full p-1 transition-colors relative shadow-inner shrink-0 ${autoConnect ? 'bg-success' : 'bg-border-light dark:bg-black/20'}`}
                >
                  <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform absolute top-1 ${autoConnect ? 'translate-x-5' : 'translate-x-0'}`}></div>
                </button>
              </div>

              <div className="flex items-center justify-between p-4 bg-transparent hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center">
                    <I.Bell />
                  </div>
                  <div>
                    <div className="font-semibold text-text text-[15px]">{l("System Notifications", "系统通知")}</div>
                    <div className="text-xs text-text-muted mt-0.5">{l("Show alerts for traffic usage and status", "接收流量不足或连接状态变化的通知")}</div>
                  </div>
                </div>
                <button 
                  onClick={() => setNotifications(!notifications)}
                  className={`w-12 h-7 rounded-full p-1 transition-colors relative shadow-inner shrink-0 ${notifications ? 'bg-primary' : 'bg-border-light dark:bg-black/20'}`}
                >
                  <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform absolute top-1 ${notifications ? 'translate-x-5' : 'translate-x-0'}`}></div>
                </button>
              </div>

            </div>
          </div>
        )}

        {/* --- NETWORK TAB --- */}
        {activeTab === 'network' && (
          <div className="animate-fade-in flex flex-col gap-6">
            <div>
              <h1 className="text-2xl font-heading font-bold text-text flex items-center gap-3">
                {l("Network Configuration", "网络配置")}
                <span className="px-2.5 py-0.5 text-[11px] font-bold bg-warning/10 text-warning rounded-full">{l("Advanced", "高级")}</span>
              </h1>
              <p className="text-sm text-text-muted mt-1">{l("Configure routing and bypass rules.", "配置路由与跳过规则。")}</p>
            </div>

            <div className="bg-surface/60 backdrop-blur-2xl border border-border-glass rounded-[32px] p-2 shadow-sm flex flex-col gap-2">
              <div className="p-4 rounded-[24px] bg-white dark:bg-surface-active border border-border-glass shadow-sm flex flex-col">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 shrink-0 rounded-2xl bg-text-muted/10 text-text-muted flex items-center justify-center">
                    <I.ShieldOff />
                  </div>
                  <div className="flex-1 w-full pt-1">
                    <div className="font-semibold text-text text-[15px]">{l("Bypass Proxy List", "代理白名单 (跳过代理)")}</div>
                    <div className="text-sm text-text-muted mt-1 leading-relaxed">
                      {l("Traffic to these destinations will bypass the proxy and use direct connection. Supports wildcards (*.example.com). Separate by commas.", "发往这些目标地址的流量将直接连接，不经过代理服务器。支持通配符（如 *.example.com），多个地址请用英文逗号分隔。")}
                    </div>
                    
                    <textarea 
                      value={bypassDomains}
                      onChange={(e) => setBypassDomains(e.target.value)}
                      className="w-full mt-5 p-4 rounded-xl bg-surface border border-border focus:border-primary/50 focus:ring-2 focus:ring-primary/20 outline-none transition-all text-[14px] font-mono text-text resize-y min-h-[120px] shadow-inner"
                      placeholder="localhost, 127.0.0.1"
                    />
                    
                    <div className="flex justify-end mt-4">
                      <button className="px-6 py-2.5 rounded-xl bg-primary text-text-inverse text-[14px] font-semibold shadow-sm hover:bg-primary-hover active:scale-95 transition-all">
                        {l("Save Configuration", "保存配置")}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        
      </div>
    </div>
  )
}
