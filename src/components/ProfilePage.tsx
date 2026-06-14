import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

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
  ChevronRight: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>)
}

export default function ProfilePage() {
  const { i18n } = useTranslation()
  const navigate = useNavigate()
  const l = (en: string, zh: string) => i18n.language.startsWith('zh') ? zh : en;

  const [activeTab, setActiveTab] = useState<"account" | "subscription" | "devices">("account")

  return (
    <div className="w-full max-w-[1000px] mx-auto animate-fade-in px-4 md:px-8 pb-12 pt-8 flex flex-col md:flex-row gap-8 lg:gap-12 relative z-10">
      
      {/* Left Sidebar */}
      <div className="w-full md:w-[260px] shrink-0 flex flex-col gap-8">
        
        {/* User Mini Profile */}
        <div className="flex items-center gap-4 px-2">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-primary to-accent-purple p-[2px] shadow-sm">
            <div className="w-full h-full rounded-[14px] bg-surface flex items-center justify-center overflow-hidden">
              <img src="https://ui-avatars.com/api/?name=User&background=0D8ABC&color=fff" alt="User" className="w-full h-full object-cover" />
            </div>
          </div>
          <div>
            <h2 className="font-heading font-bold text-text text-lg leading-tight">Super User</h2>
            <div className="text-[11px] text-primary bg-primary/10 px-2 py-0.5 rounded-full font-bold inline-flex items-center gap-1 mt-1">
              <I.Crown /> {l("Pro", "专业版")}
            </div>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="flex flex-col gap-1 mt-2">
          <button 
            onClick={() => setActiveTab('account')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all ${activeTab === 'account' ? 'glass-active-pill' : 'text-text-secondary hover:text-text hover:bg-surface-active/60'}`}
          >
            <I.User /> {l("Account Settings", "账号设置")}
          </button>
          
          <button 
            onClick={() => setActiveTab('subscription')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all ${activeTab === 'subscription' ? 'glass-active-pill' : 'text-text-secondary hover:text-text hover:bg-surface-active/60'}`}
          >
            <I.Shield /> {l("My Subscription", "我的套餐")}
          </button>
          
          <button 
            onClick={() => setActiveTab('devices')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all ${activeTab === 'devices' ? 'glass-active-pill' : 'text-text-secondary hover:text-text hover:bg-surface-active/60'}`}
          >
            <I.Monitor /> {l("Active Devices", "在线设备")}
          </button>

          <div className="h-px bg-border-glass my-2 mx-4"></div>

          <button 
            onClick={() => navigate('/')}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold text-danger hover:bg-danger/10 transition-all"
          >
            <I.LogOut /> {l("Log Out", "退出登录")}
          </button>
        </nav>
      </div>

      {/* Right Content Area */}
      <div className="flex-1 min-h-[500px]">
        {/* === ACCOUNT SETTINGS === */}
        {activeTab === 'account' && (
          <div className="animate-fade-in flex flex-col gap-6">
            <div>
              <h1 className="text-2xl font-heading font-bold text-text">{l("Account Settings", "账号设置")}</h1>
              <p className="text-sm text-text-muted mt-1">{l("Manage your email, password, and security preferences.", "管理您的邮箱、密码与安全偏好。")}</p>
            </div>

            <div className="bg-surface/60 backdrop-blur-2xl border border-border-glass shadow-sm rounded-[24px] overflow-hidden flex flex-col">
              <button className="w-full flex items-center justify-between p-4 bg-transparent hover:bg-black/5 dark:hover:bg-white/5 transition-colors group border-b border-border-glass text-left">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-surface-active text-text-secondary flex items-center justify-center group-hover:text-primary transition-colors">
                    <I.Mail />
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-text text-[15px]">{l("Email Address", "电子邮箱")}</div>
                    <div className="text-sm text-text-muted mt-0.5">user@example.com</div>
                  </div>
                </div>
                <div className="text-text-muted group-hover:text-primary transition-colors px-2"><I.ChevronRight /></div>
              </button>

              <button className="w-full flex items-center justify-between p-4 bg-transparent hover:bg-black/5 dark:hover:bg-white/5 transition-colors group text-left">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-surface-active text-text-secondary flex items-center justify-center group-hover:text-primary transition-colors">
                    <I.Key />
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-text text-[15px]">{l("Password", "登录密码")}</div>
                    <div className="text-sm text-text-muted mt-0.5">{l("Last changed 3 months ago", "上次修改于3个月前")}</div>
                  </div>
                </div>
                <div className="text-text-muted group-hover:text-primary transition-colors px-2"><I.ChevronRight /></div>
              </button>
            </div>
          </div>
        )}

        {/* === SUBSCRIPTION DETAILS === */}
        {activeTab === 'subscription' && (
          <div className="animate-fade-in flex flex-col gap-6">
            <div>
              <h1 className="text-2xl font-heading font-bold text-text">{l("My Subscription", "我的套餐")}</h1>
              <p className="text-sm text-text-muted mt-1">{l("View your current plan limits and billing cycle.", "查看您当前套餐的额度与计费周期。")}</p>
            </div>

            <div className="bg-surface/60 backdrop-blur-2xl border border-border-glass shadow-sm rounded-[24px] p-8 flex flex-col relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 blur-[80px] rounded-full pointer-events-none -mr-20 -mt-20"></div>
              
              <div className="flex justify-between items-start mb-8 relative z-10">
                <div>
                  <div className="text-3xl font-heading font-bold mb-1 text-text">{l("Pro Plan", "专业版")}</div>
                  <div className="text-text-muted text-sm">{l("Billed monthly, next charge on Dec 15", "按月计费，下次扣费日期 12月15日")}</div>
                </div>
                <button 
                  onClick={() => navigate('/dashboard/subscription')}
                  className="text-sm font-bold text-text-inverse bg-primary hover:bg-primary-hover px-5 py-2.5 rounded-xl transition-all shadow-sm"
                >
                  {l("Upgrade Plan", "升级套餐")}
                </button>
              </div>

              <div className="bg-white/50 dark:bg-surface-active rounded-2xl p-6 border border-border-glass relative z-10">
                <div className="flex justify-between items-end mb-3">
                  <div>
                    <div className="text-sm text-text-muted mb-1 font-medium">{l("Data Usage", "已用流量")}</div>
                    <div className="text-3xl font-bold font-mono tracking-tight text-text">12.5 <span className="text-lg text-text-muted">GB</span></div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-text-muted mb-1 font-medium">{l("Total Allowance", "总额度")}</div>
                    <div className="text-xl font-bold font-mono tracking-tight text-text">20 <span className="text-sm text-text-muted">GB</span></div>
                  </div>
                </div>
                <div className="w-full h-2.5 rounded-full bg-border-glass overflow-hidden mt-4 shadow-inner">
                  <div className="h-full rounded-full bg-primary shadow-sm" style={{ width: "62%" }}></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* === ACTIVE DEVICES === */}
        {activeTab === 'devices' && (
          <div className="animate-fade-in flex flex-col gap-6">
            <div>
              <h1 className="text-2xl font-heading font-bold text-text">{l("Active Devices", "在线设备")}</h1>
              <p className="text-sm text-text-muted mt-1">{l("Manage devices currently connected to your proxy.", "管理当前已连接到代理网络的设备。")}</p>
            </div>

            <div className="bg-surface/60 backdrop-blur-2xl border border-border-glass shadow-sm rounded-[24px] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between p-4 bg-transparent hover:bg-black/5 dark:hover:bg-white/5 transition-colors border-b border-border-glass">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-success/10 text-success flex items-center justify-center">
                    <I.Monitor />
                  </div>
                  <div>
                    <div className="font-semibold text-text text-[15px]">MacBook Pro 16"</div>
                    <div className="text-xs text-text-muted flex items-center gap-1.5 mt-1 font-medium">
                      <span className="w-2 h-2 rounded-full bg-success"></span> {l("Online now · macOS", "当前在线 · macOS")}
                    </div>
                  </div>
                </div>
                <button className="px-4 py-2 text-sm font-semibold text-danger hover:bg-danger/10 rounded-xl transition-colors">{l("Revoke", "下线")}</button>
              </div>

              <div className="flex items-center justify-between p-4 bg-transparent hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-surface-active text-text-muted flex items-center justify-center border border-border-glass">
                    <I.Smartphone />
                  </div>
                  <div>
                    <div className="font-semibold text-text text-[15px]">iPhone 15 Pro</div>
                    <div className="text-xs text-text-muted flex items-center gap-1.5 mt-1 font-medium">
                      <span className="w-2 h-2 rounded-full bg-text-muted"></span> {l("Last active 2h ago · iOS", "2小时前活跃 · iOS")}
                    </div>
                  </div>
                </div>
                <button className="px-4 py-2 text-sm font-semibold text-danger hover:bg-danger/10 rounded-xl transition-colors">{l("Revoke", "下线")}</button>
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
