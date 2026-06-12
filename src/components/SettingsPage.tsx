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
  Check: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>),
}

export default function SettingsPage() {
  const { i18n } = useTranslation()
  const { theme, toggleTheme } = useTheme()
  const l = (en: string, zh: string) => i18n.language.startsWith('zh') ? zh : en;

  const [bypassDomains, setBypassDomains] = useState("localhost, 127.0.0.1, ::1, *.local")
  const [autoConnect, setAutoConnect] = useState(true)
  const [notifications, setNotifications] = useState(false)

  return (
    <div className="flex flex-col w-full max-w-[800px] mx-auto animate-fade-in px-4 md:px-8 pb-32 pt-6">
      
      {/* Header */}
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-heading font-bold text-text">{l("Settings", "系统设置")}</h1>
        <p className="text-sm text-text-muted mt-2">
          {l("Customize application preferences", "自定义您的应用偏好设置")}
        </p>
      </div>

      <div className="flex flex-col gap-8">
        
        {/* Section: General */}
        <section>
          <h2 className="text-[13px] font-bold text-text-muted uppercase tracking-wider mb-3 px-4">{l("General", "通用")}</h2>
          <div className="bg-surface/80 backdrop-blur-xl border border-border rounded-2xl shadow-sm overflow-hidden flex flex-col">
            
            {/* Theme Row */}
            <div className="flex items-center justify-between p-4 bg-transparent border-b border-border/50 hover:bg-surface-active/30 transition-colors">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
                  {theme === "dark" ? <I.Moon /> : <I.Sun />}
                </div>
                <div className="text-[15px] font-medium text-text">{l("Appearance", "外观主题")}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-text-muted">{theme === "dark" ? l("Dark", "深色") : l("Light", "浅色")}</span>
                <button 
                  onClick={toggleTheme}
                  className={`w-12 h-7 rounded-full p-1 transition-colors relative shadow-inner ${theme === 'dark' ? 'bg-primary' : 'bg-border-light'}`}
                >
                  <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform absolute top-1 ${theme === 'dark' ? 'translate-x-5' : 'translate-x-0'}`}></div>
                </button>
              </div>
            </div>

            {/* Language Row */}
            <div className="flex items-center justify-between p-4 bg-transparent hover:bg-surface-active/30 transition-colors">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-500 flex items-center justify-center">
                  <I.Globe />
                </div>
                <div className="text-[15px] font-medium text-text">{l("Language", "语言设置")}</div>
              </div>
              <div className="flex bg-surface-active/50 rounded-lg p-1 border border-border-glass">
                <button 
                  onClick={() => i18n.changeLanguage("zh")}
                  className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${i18n.language.startsWith("zh") ? 'bg-white dark:bg-surface text-text shadow-sm' : 'text-text-muted hover:text-text'}`}
                >
                  中文
                </button>
                <button 
                  onClick={() => i18n.changeLanguage("en")}
                  className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${!i18n.language.startsWith("zh") ? 'bg-white dark:bg-surface text-text shadow-sm' : 'text-text-muted hover:text-text'}`}
                >
                  EN
                </button>
              </div>
            </div>

          </div>
        </section>

        {/* Section: Application */}
        <section>
          <h2 className="text-[13px] font-bold text-text-muted uppercase tracking-wider mb-3 px-4">{l("Application", "应用行为")}</h2>
          <div className="bg-surface/80 backdrop-blur-xl border border-border rounded-2xl shadow-sm overflow-hidden flex flex-col">
            
            <div className="flex items-center justify-between p-4 bg-transparent border-b border-border/50 hover:bg-surface-active/30 transition-colors">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-lg bg-green-500/10 text-green-600 flex items-center justify-center">
                  <I.Rocket />
                </div>
                <div>
                  <div className="text-[15px] font-medium text-text">{l("Auto-Connect", "启动时自动连接")}</div>
                  <div className="text-[12px] text-text-muted mt-0.5">{l("Connect to fastest node on startup", "启动应用时自动连接最优节点")}</div>
                </div>
              </div>
              <button 
                onClick={() => setAutoConnect(!autoConnect)}
                className={`w-12 h-7 rounded-full p-1 transition-colors relative shadow-inner shrink-0 ${autoConnect ? 'bg-success' : 'bg-border-light'}`}
              >
                <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform absolute top-1 ${autoConnect ? 'translate-x-5' : 'translate-x-0'}`}></div>
              </button>
            </div>

            <div className="flex items-center justify-between p-4 bg-transparent hover:bg-surface-active/30 transition-colors">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-lg bg-orange-500/10 text-orange-500 flex items-center justify-center">
                  <I.Bell />
                </div>
                <div>
                  <div className="text-[15px] font-medium text-text">{l("Notifications", "系统通知")}</div>
                  <div className="text-[12px] text-text-muted mt-0.5">{l("Show alerts for traffic usage", "流量不足时弹出系统警告")}</div>
                </div>
              </div>
              <button 
                onClick={() => setNotifications(!notifications)}
                className={`w-12 h-7 rounded-full p-1 transition-colors relative shadow-inner shrink-0 ${notifications ? 'bg-primary' : 'bg-border-light'}`}
              >
                <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform absolute top-1 ${notifications ? 'translate-x-5' : 'translate-x-0'}`}></div>
              </button>
            </div>

          </div>
        </section>

        {/* Section: Network */}
        <section>
          <h2 className="text-[13px] font-bold text-text-muted uppercase tracking-wider mb-3 px-4 flex items-center gap-2">
            {l("Network", "网络配置")}
            <span className="px-2 py-0.5 text-[9px] font-bold bg-warning/10 text-warning rounded-full">{l("Advanced", "高级")}</span>
          </h2>
          <div className="bg-surface/80 backdrop-blur-xl border border-border rounded-2xl shadow-sm overflow-hidden flex flex-col p-5">
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 shrink-0 rounded-lg bg-text-muted/10 text-text-muted flex items-center justify-center">
                <I.ShieldOff />
              </div>
              <div className="flex-1 w-full">
                <div className="text-[15px] font-medium text-text">{l("Bypass Proxy", "跳过代理的地址")}</div>
                <div className="text-[12px] text-text-muted mt-1 leading-relaxed">
                  {l("Comma separated domains or IPs. Traffic will bypass the proxy.", "发往这些目标地址的流量将直连。支持通配符 (*.example.com)，多个地址用英文逗号分隔。")}
                </div>
                
                <textarea 
                  value={bypassDomains}
                  onChange={(e) => setBypassDomains(e.target.value)}
                  className="w-full mt-4 p-3 rounded-xl bg-bg border border-border focus:border-primary/50 focus:ring-2 focus:ring-primary/20 outline-none transition-all text-[13px] font-mono text-text resize-y min-h-[80px]"
                  placeholder="localhost, 127.0.0.1"
                />
                
                <div className="flex justify-end mt-4">
                  <button className="px-5 py-2 rounded-lg bg-primary text-white text-[13px] font-semibold shadow-sm hover:bg-primary-hover active:scale-95 transition-all">
                    {l("Save", "保存配置")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

      </div>
    </div>
  )
}
