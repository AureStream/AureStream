import React, { useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

/* ── Icons ── */
const I = {
  Check: () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>),
  Cross: () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>),
  Shield: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>),
  Zap: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>),
  Crown: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="2 15 7 22 17 22 22 15 17 9 12 15 7 9 2 15"/></svg>)
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
    <div className="flex flex-col gap-6 w-full max-w-[1100px] mx-auto animate-fade-in px-4 md:px-8 pb-16 pt-6">
      
      {/* Header text */}


      {/* iOS Segmented Control for Billing Toggle */}
      <div className="flex items-center gap-2 bg-surface-active/50 p-1.5 rounded-2xl w-fit border border-border-glass shadow-sm mt-4">
        <button
          onClick={() => setBilling("monthly")}
          className={`px-8 py-2.5 rounded-xl text-sm font-semibold transition-all ${billing === "monthly" ? 'glass-active-pill' : 'text-text-secondary hover:text-text hover:bg-surface-active/60'}`}
        >
          {l("Monthly", "按月计费")}
        </button>
        <button
          onClick={() => setBilling("yearly")}
          className={`px-8 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 ${billing === "yearly" ? 'glass-active-pill' : 'text-text-secondary hover:text-text hover:bg-surface-active/60'}`}
        >
          {l("Yearly", "按年计费")}
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide ${billing === "yearly" ? 'bg-primary/10 text-primary' : 'bg-success/20 text-success'}`}>
            {l("Save 17%", "立省 17%")}
          </span>
        </button>
      </div>

      {/* Pricing Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full mt-6">
        {plans.map(plan => (
            <div 
              key={plan.id}
              className={`relative flex flex-col rounded-[32px] p-8 transition-all duration-300 overflow-hidden bg-surface/80 backdrop-blur-xl border-2 border-transparent text-text hover:bg-white dark:hover:bg-white/5 hover:-translate-y-1 hover:border-border-light hover:shadow-glass-hover`}
            >
            {/* Optional badge placeholder, currently removed for consistency */}

            <div className="flex items-center gap-3 mb-4 relative z-10">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm transition-colors bg-surface-active/80 text-text-secondary border border-border-glass`}>
                {plan.icon}
              </div>
              <div>
                <h3 className={`text-xl font-heading font-bold text-text`}>{plan.name}</h3>
                <p className="text-xs mt-0.5 text-text-muted">{plan.desc}</p>
              </div>
            </div>

            <div className="my-6 relative z-10">
              <span className="text-4xl font-heading font-bold tracking-tight">
                ¥{billing === "monthly" ? plan.priceMonthly : plan.priceYearly}
              </span>
              <span className={`text-sm font-medium ml-1 text-text-muted`}>
                / {billing === "monthly" ? l("month", "月") : l("year", "年")}
              </span>
            </div>

            <button 
              onClick={() => navigate('/dashboard/checkout')}
              className={`w-full py-3.5 rounded-xl font-bold transition-all mb-8 relative z-10 shadow-sm bg-text dark:bg-white text-white dark:text-bg hover:scale-[1.02] active:scale-[0.98]`}
            >
              {l("Subscribe Now", "立即订阅")}
            </button>

            <div className="flex flex-col gap-4 relative z-10 mt-auto">
              {plan.features.map((feature, i) => (
                <div key={i} className={`flex items-start gap-3 text-sm ${!feature.included && 'opacity-40'}`}>
                  <div className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${feature.included ? 'bg-success/20 text-success' : 'bg-surface-active text-text-muted'}`}>
                    {feature.included ? <I.Check /> : <I.Cross />}
                  </div>
                  <span className={`${feature.included ? 'font-medium text-text' : 'text-text-muted'}`}>
                    {feature.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="text-center mt-12 text-sm text-text-muted">
        AureStream v0.2.5 &middot; &copy; 2026 {l("All rights reserved.", "版权所有")}
      </div>
    </div>
  )
}
