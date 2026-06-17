import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

/* ── Icons ── */
const I = {
  Check: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  Cross: () => (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  Shield: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  Zap: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  Crown: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="2 15 7 22 17 22 22 15 17 9 12 15 7 9 2 15" />
    </svg>
  ),
}

interface Plan {
  id: string
  name: string
  desc: string
  icon: React.ReactNode
  priceMonthly: number
  priceYearly: number
  isPro?: boolean
  features: { name: string; included: boolean }[]
}

export default function SubscriptionPage() {
  const { i18n } = useTranslation()
  const navigate = useNavigate()
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly")

  const l = (en: string, zh: string) => i18n.language.startsWith('zh') ? zh : en;

  const plans: Plan[] = [
    {
      id: "basic",
      name: l("Basic", "基础版"),
      desc: l("Perfect for casual browsing", "适合日常轻度使用"),
      icon: <I.Shield />,
      priceMonthly: 9.9,
      priceYearly: 99,
      features: [
        { name: l("Standard speed nodes", "标准速度节点"), included: true },
        { name: l("100GB Data / Month", "每月 100GB 流量"), included: true },
        { name: l("2 Devices simultaneously", "支持 2 台设备同时在线"), included: true },
        { name: l("Standard Support", "标准工单支持"), included: true },
        { name: l("Streaming Unblocked", "流媒体解锁"), included: false },
        { name: l("IEPL Dedicated lines", "IEPL 专线节点"), included: false },
      ]
    },
    {
      id: "pro",
      name: l("Pro", "专业版"),
      desc: l("Best for power users", "重度用户及流媒体首选"),
      icon: <I.Zap />,
      priceMonthly: 19.9,
      priceYearly: 199,
      isPro: true,
      features: [
        { name: l("High-speed premium nodes", "高速优选节点"), included: true },
        { name: l("500GB Data / Month", "每月 500GB 流量"), included: true },
        { name: l("5 Devices simultaneously", "支持 5 台设备同时在线"), included: true },
        { name: l("Priority Support", "24/7 优先技术支持"), included: true },
        { name: l("Streaming Unblocked", "全球流媒体完美解锁"), included: true },
        { name: l("IEPL Dedicated lines", "IEPL 专线节点"), included: false },
      ]
    },
    {
      id: "ultimate",
      name: l("Ultimate", "终极版"),
      desc: l("No compromises", "专为极致网络体验打造"),
      icon: <I.Crown />,
      priceMonthly: 39.9,
      priceYearly: 399,
      features: [
        { name: l("All Global Nodes", "全部全球高速节点"), included: true },
        { name: l("Unlimited Data", "不限流量"), included: true },
        { name: l("Unlimited Devices", "不限制设备数"), included: true },
        { name: l("VIP Support", "1对1 专属技术支持"), included: true },
        { name: l("Streaming Unblocked", "全球流媒体完美解锁"), included: true },
        { name: l("IEPL Dedicated lines", "顶级 IEPL 企业专线"), included: true },
      ]
    }
  ]

  return (
    <div className="flex flex-col gap-5 w-full max-w-[1100px] mx-auto animate-fade-in px-4 md:px-6 pb-6 pt-1 relative z-10">
      
      {/* Redesigned Premium Header */}
      <div className="text-center mt-2 mb-1 animate-fade-in-up">
        <h1 className="text-2xl md:text-3xl font-heading font-extrabold tracking-tight text-text bg-gradient-to-r from-primary via-secondary to-accent-purple bg-clip-text text-transparent">
          {l("Choose Your Subscription", "选择适合您的流量套餐")}
        </h1>
        <p className="text-xs md:text-sm text-text-muted mt-1.5 max-w-lg mx-auto leading-relaxed">
          {l("Premium dedicated network nodes with state-of-the-art tunnel protocols.", "全系节点采用前沿加密协议与专线技术，随时畅享无阻碍的网络互联。")}
        </p>
      </div>

      {/* Centered iOS Segmented Control for Billing Toggle */}
      <div className="flex justify-center mb-1 animate-fade-in-up" style={{ animationDelay: '50ms' }}>
        <div className="flex items-center gap-1.5 bg-surface-active/60 p-1 rounded-2xl border border-border-glass shadow-glass backdrop-blur-md">
          <button
            onClick={() => setBilling("monthly")}
            className={`px-6 py-2 rounded-xl text-xs font-bold transition-all ${billing === "monthly" ? 'glass-active-pill text-primary' : 'text-text-secondary hover:text-text hover:bg-surface-active/30'}`}
          >
            {l("Monthly", "按月计费")}
          </button>
          <button
            onClick={() => setBilling("yearly")}
            className={`px-6 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${billing === "yearly" ? 'glass-active-pill text-primary' : 'text-text-secondary hover:text-text hover:bg-surface-active/30'}`}
          >
            {l("Yearly", "按年计费")}
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-extrabold tracking-wide ${billing === "yearly" ? 'bg-secondary/10 text-secondary' : 'bg-success/20 text-success'}`}>
              -17%
            </span>
          </button>
        </div>
      </div>

      {/* Redesigned Premium Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full mt-2 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
        {plans.map(plan => (
          <div 
            key={plan.id}
            className={`relative flex flex-col rounded-[24px] p-5.5 transition-all duration-300 overflow-hidden text-text hover:scale-[1.02] hover:-translate-y-1 hover:shadow-glass-hover ${plan.isPro ? 'bg-surface/90 border-2 border-secondary/50 shadow-[0_8px_30px_rgba(92,103,242,0.15)] ring-1 ring-secondary/30' : 'bg-surface/75 border border-border-glass hover:border-border-light hover:bg-white dark:hover:bg-white/5 shadow-sm'}`}
          >
            {/* Mesh background decorator for featured plan */}
            {plan.isPro && (
              <div className="absolute inset-0 bg-gradient-to-tr from-secondary/5 to-accent-purple/10 pointer-events-none z-0"></div>
            )}

            {/* Float badge for featured plan */}
            {plan.isPro && (
              <span className="absolute top-4 right-4 px-2.5 py-0.5 text-[9px] font-extrabold uppercase tracking-widest bg-gradient-to-r from-secondary to-accent-purple text-white rounded-full shadow-md z-20 animate-pulse">
                {l("Popular", "推荐")}
              </span>
            )}

            <div className="flex items-center gap-3 mb-4 relative z-10">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shadow-sm transition-colors border ${plan.isPro ? 'bg-secondary/20 text-secondary border-secondary/30' : 'bg-surface-active text-text-secondary border-border-glass'}`}>
                {plan.icon}
              </div>
              <div>
                <h3 className={`text-base font-heading font-extrabold text-text ${plan.isPro ? 'bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent' : ''}`}>{plan.name}</h3>
                <p className="text-[11px] mt-0.5 text-text-muted">{plan.desc}</p>
              </div>
            </div>

            <div className="my-3 relative z-10 flex items-baseline gap-1">
              <span className="text-3xl font-heading font-extrabold tracking-tight text-text">
                ¥{billing === "monthly" ? plan.priceMonthly : plan.priceYearly}
              </span>
              <span className="text-xs font-semibold text-text-muted">
                / {billing === "monthly" ? l("mo", "月") : l("yr", "年")}
              </span>
            </div>

            <button 
              onClick={() => navigate('/dashboard/checkout')}
              className={`w-full py-2.5 rounded-xl font-bold transition-all mb-4 relative z-10 shadow-md hover:scale-[1.01] active:scale-[0.99] text-xs ${plan.isPro ? 'bg-gradient-to-r from-secondary to-accent-purple text-white hover:opacity-95' : 'bg-primary dark:bg-white text-text-inverse dark:text-bg hover:bg-primary-hover hover:opacity-95'}`}
            >
              {l("Subscribe Now", "立即订阅")}
            </button>

            <div className="flex flex-col gap-2.5 relative z-10 mt-auto">
              {plan.features.map((feature, i) => (
                <div key={i} className={`flex items-start gap-2.5 text-xs ${!feature.included && 'opacity-35'}`}>
                  <div className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0 border ${feature.included ? 'bg-success/15 border-success/35 text-success' : 'bg-surface-active border-border-glass text-text-muted'}`}>
                    {feature.included ? <I.Check /> : <I.Cross />}
                  </div>
                  <span className={`${feature.included ? 'font-medium text-text' : 'text-text-muted'} truncate`}>
                    {feature.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="text-center mt-6 text-xs text-text-muted">
        AureStream v0.2.5 &middot; &copy; 2026 {l("All rights reserved.", "版权所有")}
      </div>
    </div>
  )
}
