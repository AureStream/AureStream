import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "./ui/button"
import { cn } from "@/lib/utils"

interface Plan {
  id: string
  nameKey: string
  priceMonthly: number
  priceYearly: number
  accent: "yellow" | "purple" | "gradient"
  recommended?: boolean
  features: { key: string; included: boolean }[]
}

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20,6 9,17 4,12"/>
  </svg>
)

const CrossIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
)

export default function SubscriptionPage() {
  const { t } = useTranslation()
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly")

  const plans: Plan[] = [
    {
      id: "basic", nameKey: "basic_plan", priceMonthly: 9.9, priceYearly: 99, accent: "yellow",
      features: [
        { key: "features_basic_1", included: true }, { key: "features_basic_2", included: true },
        { key: "features_basic_3", included: true }, { key: "features_basic_4", included: true },
        { key: "features_pro_5", included: false }, { key: "features_ultimate_5", included: false },
      ],
    },
    {
      id: "pro", nameKey: "pro_plan", priceMonthly: 19.9, priceYearly: 199, accent: "purple", recommended: true,
      features: [
        { key: "features_pro_1", included: true }, { key: "features_pro_2", included: true },
        { key: "features_pro_3", included: true }, { key: "features_pro_4", included: true },
        { key: "features_pro_5", included: true }, { key: "features_ultimate_5", included: false },
      ],
    },
    {
      id: "ultimate", nameKey: "ultimate_plan", priceMonthly: 39.9, priceYearly: 399, accent: "gradient",
      features: [
        { key: "features_ultimate_1", included: true }, { key: "features_ultimate_2", included: true },
        { key: "features_ultimate_3", included: true }, { key: "features_ultimate_4", included: true },
        { key: "features_ultimate_5", included: true }, { key: "features_ultimate_6", included: true },
      ],
    },
  ]

  return (
    <div className="subscription-layout">
      <div className="subscription-content">
        {/* Header */}
        <div className="text-center mb-3 animate-fade-in">
          <h1 className="text-3xl font-bold mb-2 font-heading">{t("choose_plan")}</h1>
          <p className="text-sm text-text-secondary max-w-md mx-auto">{t("subscription_subtitle")}</p>
        </div>

        {/* Billing toggle */}
        <div className="flex justify-center mb-10 animate-fade-in">
          <div className="billing-toggle">
            <button
              className={cn("billing-option", billing === "monthly" && "active")}
              onClick={() => setBilling("monthly")}
            >
              {t("monthly")}
            </button>
            <button
              className={cn("billing-option", billing === "yearly" && "active")}
              onClick={() => setBilling("yearly")}
            >
              {t("yearly")}
              <span className={cn(
                "text-[11px] ml-1.5 px-1.5 py-0.5 rounded-full font-medium",
                billing === "yearly" ? "bg-white/20" : "bg-accent-green text-accent-green-text"
              )}>
                {t("save_percent", { percent: 17 })}
              </span>
            </button>
          </div>
        </div>

        {/* Pricing cards */}
        <div className="pricing-grid animate-fade-in stagger-fade-in">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={cn(
                "pricing-card",
                plan.recommended && "featured",
                plan.accent === "gradient" && "!bg-gradient-to-br !from-primary !to-secondary !text-white !border-transparent"
              )}
            >
              {plan.recommended && <div className="pricing-badge">{t("recommended")}</div>}

              <h3 className={cn(
                "text-lg font-bold mb-1 font-heading",
                plan.accent === "gradient" && "!text-white"
              )}>
                {t(plan.nameKey)}
              </h3>

              <div className="mb-1">
                <span className={cn(
                  "text-4xl font-bold font-heading",
                  plan.accent === "gradient" && "!text-white"
                )}>
                  &yen;{billing === "monthly" ? plan.priceMonthly : plan.priceYearly}
                </span>
                <span className={cn(
                  "text-sm ml-1",
                  plan.accent === "gradient" ? "text-white/70" : "text-text-muted"
                )}>
                  {billing === "monthly" ? t("per_month") : t("per_year")}
                </span>
              </div>

              {billing === "yearly" && (
                <div className={cn(
                  "text-xs mb-2",
                  plan.accent === "gradient" ? "text-white/60" : "text-text-muted"
                )}>
                  {t("billed_yearly")}
                </div>
              )}

              <div className="feature-list">
                {plan.features.map((f) => (
                  <div key={f.key} className={cn("feature-item", !f.included && "opacity-40")}>
                    <span className={cn(
                      "w-5 h-5 rounded-full flex items-center justify-center shrink-0",
                      f.included
                        ? plan.accent === "gradient"
                          ? "bg-white/20 text-white"
                          : "bg-accent-green text-accent-green-text"
                        : plan.accent === "gradient"
                          ? "bg-white/10 text-white/50"
                          : "bg-border-light text-text-muted"
                    )}>
                      {f.included ? <CheckIcon /> : <CrossIcon />}
                    </span>
                    <span className={cn(
                      "text-sm",
                      plan.accent === "gradient" && "text-white/90"
                    )}>
                      {t(f.key)}
                    </span>
                  </div>
                ))}
              </div>

              <Button
                variant={plan.accent === "gradient" ? "ghost" : plan.recommended ? "gradient" : "secondary"}
                className={cn(
                  "w-full mt-2",
                  plan.accent === "gradient" && "bg-white/15 text-white hover:bg-white/25"
                )}
              >
                {plan.recommended ? t("upgrade") : t("get_started")}
              </Button>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="text-center mt-12 text-xs text-text-muted">
          AureStream v0.2.5 &middot; &copy; 2026 {t("all_rights_reserved")}
        </div>
      </div>
    </div>
  )
}
