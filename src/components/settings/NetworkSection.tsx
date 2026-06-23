import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import {
  getProxyBypass,
  setProxyBypass,
  getCustomRuleSet,
  setCustomRuleSet,
} from "../../single/store"
import {
  BYPASS_PLACEHOLDER,
  parseBypassInputToRuleSet,
  resolveBypassDisplayValue,
  resolveBypassPersistValue,
  ruleSetToBypassInput,
} from "../../lib/proxy-bypass"

const I = {
  Route: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="19" r="3" /><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" /><circle cx="18" cy="5" r="3" />
    </svg>
  ),
}

export default function NetworkSection() {
  const { i18n } = useTranslation()
  const l = (en: string, zh: string) => (i18n.language.startsWith("zh") ? zh : en)

  const [bypassDomains, setBypassDomains] = useState("")

  useEffect(() => {
    Promise.all([getProxyBypass(), getCustomRuleSet("direct")]).then(
      ([bypass, directRules]) => {
        const directRuleText = ruleSetToBypassInput(directRules)
        setBypassDomains(directRuleText || resolveBypassDisplayValue(bypass))
      }
    )
  }, [])

  const persist = (fn: () => Promise<void>) => fn().catch((e: unknown) => console.error("Failed to save setting:", e))

  const persistProxyBypass = async () => {
    const normalized = resolveBypassPersistValue(bypassDomains)
    setBypassDomains(normalized)
    await persist(async () => {
      await Promise.all([
        setProxyBypass(normalized),
        setCustomRuleSet("direct", parseBypassInputToRuleSet(normalized)),
      ])
    })
  }

  return (
    <div className="glass-card rounded-[24px] p-5 shadow-glass h-full flex flex-col">
      <div className="flex items-center gap-3 mb-4 shrink-0">
        <span className="w-8 h-8 rounded-xl flex items-center justify-center bg-warning/15 text-warning"><I.Route /></span>
        <h3 className="text-sm font-extrabold text-text tracking-wide">{l("Network & Routing", "网络与分流")}</h3>
      </div>

      <div className="flex flex-col gap-3 flex-1 min-h-0">
        {/* Bypass textarea */}
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex items-center justify-between mb-2 shrink-0">
            <span className="text-xs font-bold text-text-muted uppercase tracking-wider whitespace-nowrap truncate">
              {l("Bypass Domains & IPs", "绕过代理域名与 IP 段")}
            </span>
            <span className="text-xs text-text-muted whitespace-nowrap truncate">{l("Comma separated", "逗号分隔")}</span>
          </div>
          <textarea
            value={bypassDomains}
            onChange={(e) => setBypassDomains(e.target.value)}
            onBlur={persistProxyBypass}
            className="w-full flex-1 min-h-[80px] px-5 py-4 rounded-2xl bg-surface-active/15 border border-border-glass/40 outline-none transition-all text-sm font-mono text-text resize-none shadow-inner no-scrollbar"
            placeholder={BYPASS_PLACEHOLDER}
          />
        </div>
      </div>
    </div>
  )
}
