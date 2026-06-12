import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

/* ── Icons ── */
const I = {
  ArrowLeft: () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>),
  Check: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>),
  Shield: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>),
  CreditCard: () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>),
  Crypto: () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>),
}

export default function CheckoutPage() {
  const { i18n } = useTranslation()
  const navigate = useNavigate()
  const l = (en: string, zh: string) => i18n.language.startsWith('zh') ? zh : en;

  const [paymentMethod, setPaymentMethod] = useState<"alipay" | "wechat" | "crypto">("alipay")

  return (
    <div className="flex flex-col w-full max-w-[900px] mx-auto animate-fade-in px-4 md:px-8 pb-32 pt-4">
      
      {/* Header */}
      <button 
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-text-muted hover:text-text font-medium transition-colors mb-8 w-fit"
      >
        <I.ArrowLeft /> {l("Back to Subscription", "返回套餐选择")}
      </button>

      <div>
        <h1 className="text-3xl font-heading font-bold text-text mb-2">{l("Checkout", "确认订单")}</h1>
        <p className="text-sm text-text-muted">{l("Securely complete your purchase to upgrade your account.", "安全地完成支付以升级您的账户。")}</p>
      </div>

      <div className="flex flex-col md:flex-row gap-8 mt-8">
        
        {/* Left Col: Order Summary */}
        <div className="w-full md:w-[360px] shrink-0">
          <div className="bg-gradient-to-br from-primary to-secondary p-6 rounded-[32px] text-white shadow-glow-primary relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-accent-blue/20 blur-[60px] rounded-full pointer-events-none -mr-10 -mt-10"></div>
            
            <div className="flex items-center gap-3 mb-6 relative z-10">
              <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center">
                <I.Shield />
              </div>
              <div>
                <div className="text-xl font-heading font-bold leading-none">{l("Pro Plan", "专业版套餐")}</div>
                <div className="text-white/80 text-sm mt-1">{l("Billed Yearly", "按年计费")}</div>
              </div>
            </div>

            <div className="space-y-3 mb-6 relative z-10 text-sm">
              <div className="flex justify-between text-white/90">
                <span>{l("Plan Base Price", "套餐基础价格")}</span>
                <span>$49.00</span>
              </div>
              <div className="flex justify-between text-white/90">
                <span>{l("Yearly Discount", "年度优惠")}</span>
                <span className="text-accent-yellow">-$9.80</span>
              </div>
              <div className="h-px bg-white/20 my-2"></div>
              <div className="flex justify-between items-end">
                <span className="text-white/80">{l("Total Amount", "订单总额")}</span>
                <span className="text-3xl font-bold font-mono">$39.20</span>
              </div>
            </div>
            
            <div className="bg-black/20 rounded-2xl p-4 backdrop-blur-md border border-white/10 relative z-10 text-xs text-white/80">
              {l("By completing this purchase, your account will be immediately upgraded to Pro.", "完成支付后，您的账户将立即升级为专业版。")}
            </div>
          </div>
        </div>

        {/* Right Col: Payment Methods */}
        <div className="flex-1 bg-surface/60 backdrop-blur-2xl border border-border-glass rounded-[32px] p-8 shadow-sm">
          <h2 className="text-lg font-bold text-text mb-6">{l("Select Payment Method", "选择支付方式")}</h2>

          <div className="flex flex-col gap-4">
            
            <button 
              onClick={() => setPaymentMethod("alipay")}
              className={`flex items-center p-4 rounded-2xl border-2 transition-all text-left ${paymentMethod === 'alipay' ? 'glass-active-pill border-transparent' : 'border-border-glass bg-white dark:bg-surface-active hover:border-primary/50'}`}
            >
              <div className="w-12 h-12 rounded-xl bg-[#1677FF]/10 text-[#1677FF] flex items-center justify-center shrink-0">
                <I.CreditCard />
              </div>
              <div className="ml-4 flex-1">
                <div className="font-bold text-text">{l("Alipay", "支付宝")}</div>
                <div className="text-xs text-text-muted mt-0.5">{l("Fast and secure payment", "快捷安全的支付方式")}</div>
              </div>
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${paymentMethod === 'alipay' ? 'border-primary bg-primary text-white' : 'border-border-glass text-transparent'}`}>
                <I.Check />
              </div>
            </button>

            <button 
              onClick={() => setPaymentMethod("wechat")}
              className={`flex items-center p-4 rounded-2xl border-2 transition-all text-left ${paymentMethod === 'wechat' ? 'glass-active-pill border-transparent' : 'border-border-glass bg-white dark:bg-surface-active hover:border-primary/50'}`}
            >
              <div className="w-12 h-12 rounded-xl bg-[#09B83E]/10 text-[#09B83E] flex items-center justify-center shrink-0">
                <I.CreditCard />
              </div>
              <div className="ml-4 flex-1">
                <div className="font-bold text-text">{l("WeChat Pay", "微信支付")}</div>
                <div className="text-xs text-text-muted mt-0.5">{l("Pay with WeChat app", "使用微信扫码支付")}</div>
              </div>
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${paymentMethod === 'wechat' ? 'border-primary bg-primary text-white' : 'border-border-glass text-transparent'}`}>
                <I.Check />
              </div>
            </button>

            <button 
              onClick={() => setPaymentMethod("crypto")}
              className={`flex items-center p-4 rounded-2xl border-2 transition-all text-left ${paymentMethod === 'crypto' ? 'glass-active-pill border-transparent' : 'border-border-glass bg-white dark:bg-surface-active hover:border-primary/50'}`}
            >
              <div className="w-12 h-12 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center shrink-0">
                <I.Crypto />
              </div>
              <div className="ml-4 flex-1">
                <div className="font-bold text-text">{l("Cryptocurrency", "加密货币")}</div>
                <div className="text-xs text-text-muted mt-0.5">USDT, BTC, ETH</div>
              </div>
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${paymentMethod === 'crypto' ? 'border-primary bg-primary text-white' : 'border-border-glass text-transparent'}`}>
                <I.Check />
              </div>
            </button>

          </div>

          <div className="mt-8 pt-6 border-t border-border-glass">
            <button className="w-full py-4 rounded-2xl bg-gradient-to-r from-primary to-secondary text-white font-bold text-lg shadow-glow-primary hover:scale-[1.02] active:scale-95 transition-all">
              {l(`Pay $39.20 Now`, `确认支付 $39.20`)}
            </button>
            <div className="text-center text-xs text-text-muted mt-4 flex items-center justify-center gap-1">
              <I.Shield /> {l("Payments are 100% secure and encrypted.", "您的支付信息受到 100% 安全加密保护。")}
            </div>
          </div>

        </div>

      </div>
    </div>
  )
}
