import { useState, useEffect } from "react"
import {
  GitForkIcon,
  PlusIcon,
  Trash2Icon,
  TagIcon,
  GlobeIcon,
  NetworkIcon,
  AlertCircleIcon,
  InfoIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { getCustomRuleSet, setCustomRuleSet } from "@/single/store"

interface RuleSet {
  domain: string[]
  domain_suffix: string[]
  ip_cidr: string[]
}

const initialRuleSet: RuleSet = {
  domain: [],
  domain_suffix: [],
  ip_cidr: [],
}

export function RouterPage() {
  const [activeRuleTab, setActiveRuleTab] = useState<"direct" | "proxy">("direct")
  const [directRules, setDirectRules] = useState<RuleSet>(initialRuleSet)
  const [proxyRules, setProxyRules] = useState<RuleSet>(initialRuleSet)

  const [inputVal, setInputVal] = useState("")
  const [ruleType, setRuleType] = useState<"domain" | "domain_suffix" | "ip_cidr">("domain")

  useEffect(() => {
    async function loadRules() {
      const direct = await getCustomRuleSet("direct")
      const proxy = await getCustomRuleSet("proxy")
      setDirectRules(direct || initialRuleSet)
      setProxyRules(proxy || initialRuleSet)
    }
    loadRules()
  }, [])

  const handleAddRule = async () => {
    if (!inputVal.trim()) return

    const targetRules = activeRuleTab === "direct" ? { ...directRules } : { ...proxyRules }
    const list = targetRules[ruleType] || []

    if (list.includes(inputVal.trim())) {
      setInputVal("")
      return
    }

    const updatedList = [...list, inputVal.trim()]
    const newRules = {
      ...targetRules,
      [ruleType]: updatedList,
    }

    if (activeRuleTab === "direct") {
      setDirectRules(newRules)
      await setCustomRuleSet("direct", newRules)
    } else {
      setProxyRules(newRules)
      await setCustomRuleSet("proxy", newRules)
    }

    setInputVal("")
  }

  const handleDeleteRule = async (type: "domain" | "domain_suffix" | "ip_cidr", value: string) => {
    const targetRules = activeRuleTab === "direct" ? { ...directRules } : { ...proxyRules }
    const list = targetRules[type] || []
    const updatedList = list.filter(item => item !== value)
    const newRules = {
      ...targetRules,
      [type]: updatedList,
    }

    if (activeRuleTab === "direct") {
      setDirectRules(newRules)
      await setCustomRuleSet("direct", newRules)
    } else {
      setProxyRules(newRules)
      await setCustomRuleSet("proxy", newRules)
    }
  }

  const currentRules = activeRuleTab === "direct" ? directRules : proxyRules

  return (
    <div className="flex flex-col h-full min-h-0 w-full gap-3 sm:gap-4">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-xl bg-violet-50 text-violet-650 dark:bg-violet-950/40 dark:text-violet-400">
            <GitForkIcon className="size-4.5" />
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-black text-slate-800 dark:text-slate-100">自定义路由规则</h1>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">配置域名、后缀或 IP 段，实现智能直连与代理分流</p>
          </div>
        </div>

        {/* Target Switcher */}
        <div className="flex rounded-lg bg-slate-100 dark:bg-white/[0.06] p-0.5 border border-slate-200/50 dark:border-white/[0.1] shrink-0">
          <button
            onClick={() => setActiveRuleTab("direct")}
            className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
              activeRuleTab === "direct"
                ? "bg-white dark:bg-white/[0.1] text-emerald-600 dark:text-emerald-400 shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700"
            }`}
          >
            直连规则 (Direct)
          </button>
          <button
            onClick={() => setActiveRuleTab("proxy")}
            className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
              activeRuleTab === "proxy"
                ? "bg-white dark:bg-white/[0.1] text-blue-600 dark:text-blue-400 shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700"
            }`}
          >
            代理规则 (Proxy)
          </button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.22fr)_minmax(0,0.78fr)] gap-3 sm:gap-5 overflow-hidden">
        {/* Left Card: Rules List */}
        <Card className="flex flex-col min-h-0 rounded-[24px] overflow-hidden border border-slate-200/60 dark:border-white/[0.08]">
          <CardContent className="flex-1 min-h-0 p-4 flex flex-col overflow-hidden gap-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-350 shrink-0">
              <InfoIcon className="size-4 text-slate-400" />
              <span>当前规则列表 ({activeRuleTab === "direct" ? "直连" : "代理"})</span>
            </div>

            {/* Scrollable Rules Container */}
            <div className="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col gap-3">
              {/* Domains Section */}
              <div className="flex flex-col gap-1.5 shrink-0">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <GlobeIcon className="size-3" /> 域名匹配 (Domain)
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {currentRules.domain && currentRules.domain.length > 0 ? (
                    currentRules.domain.map((rule, idx) => (
                      <Badge
                        key={idx}
                        variant="secondary"
                        className="text-[9px] font-bold py-0.5 px-2 bg-slate-50 hover:bg-rose-50 hover:text-rose-600 cursor-pointer border border-slate-200/50 dark:bg-white/[0.04] dark:border-white/[0.06] dark:hover:bg-rose-950/20 dark:hover:text-rose-400 group transition-colors"
                        onClick={() => handleDeleteRule("domain", rule)}
                      >
                        {rule}
                        <Trash2Icon className="size-2.5 ml-1.5 text-slate-400 group-hover:text-rose-500 transition-colors" />
                      </Badge>
                    ))
                  ) : (
                    <span className="text-[9px] text-slate-400 font-semibold italic">暂无域名匹配规则</span>
                  )}
                </div>
              </div>

              {/* Suffix Section */}
              <div className="flex flex-col gap-1.5 shrink-0">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <TagIcon className="size-3" /> 域名后缀 (Domain Suffix)
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {currentRules.domain_suffix && currentRules.domain_suffix.length > 0 ? (
                    currentRules.domain_suffix.map((rule, idx) => (
                      <Badge
                        key={idx}
                        variant="secondary"
                        className="text-[9px] font-bold py-0.5 px-2 bg-slate-50 hover:bg-rose-50 hover:text-rose-600 cursor-pointer border border-slate-200/50 dark:bg-white/[0.04] dark:border-white/[0.06] dark:hover:bg-rose-950/20 dark:hover:text-rose-400 group transition-colors"
                        onClick={() => handleDeleteRule("domain_suffix", rule)}
                      >
                        {rule}
                        <Trash2Icon className="size-2.5 ml-1.5 text-slate-400 group-hover:text-rose-500 transition-colors" />
                      </Badge>
                    ))
                  ) : (
                    <span className="text-[9px] text-slate-400 font-semibold italic">暂无后缀匹配规则</span>
                  )}
                </div>
              </div>

              {/* IP CIDR Section */}
              <div className="flex flex-col gap-1.5 shrink-0">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <NetworkIcon className="size-3" /> IP 网段 (IP CIDR)
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {currentRules.ip_cidr && currentRules.ip_cidr.length > 0 ? (
                    currentRules.ip_cidr.map((rule, idx) => (
                      <Badge
                        key={idx}
                        variant="secondary"
                        className="text-[9px] font-bold py-0.5 px-2 bg-slate-50 hover:bg-rose-50 hover:text-rose-600 cursor-pointer border border-slate-200/50 dark:bg-white/[0.04] dark:border-white/[0.06] dark:hover:bg-rose-950/20 dark:hover:text-rose-400 group transition-colors"
                        onClick={() => handleDeleteRule("ip_cidr", rule)}
                      >
                        {rule}
                        <Trash2Icon className="size-2.5 ml-1.5 text-slate-400 group-hover:text-rose-500 transition-colors" />
                      </Badge>
                    ))
                  ) : (
                    <span className="text-[9px] text-slate-400 font-semibold italic">暂无 IP CIDR 匹配规则</span>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right Card: Editor Form */}
        <Card className="rounded-[24px] border border-slate-200/60 dark:border-white/[0.08]">
          <CardContent className="p-4 flex flex-col gap-4 h-full justify-between">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-350">
                <PlusIcon className="size-4.5 text-[#3b59ff]" />
                <span>添加规则</span>
              </div>

              {/* Type Selection */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] font-extrabold text-slate-400">规则类型</label>
                <div className="grid grid-cols-3 gap-1 bg-slate-100 dark:bg-white/[0.06] p-0.5 rounded-lg border border-slate-200/30 dark:border-white/[0.06]">
                  {(["domain", "domain_suffix", "ip_cidr"] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => setRuleType(type)}
                      className={`py-1 rounded-md text-[8.5px] font-bold cursor-pointer transition-all ${
                        ruleType === type
                          ? "bg-white dark:bg-white/[0.1] text-[#3b59ff] dark:text-blue-400 shadow-sm"
                          : "text-slate-500 dark:text-slate-400 hover:text-slate-700"
                      }`}
                    >
                      {type === "domain" ? "域名" : type === "domain_suffix" ? "后缀" : "IP 网段"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Input Value */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] font-extrabold text-slate-400">匹配值</label>
                <input
                  type="text"
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  placeholder={
                    ruleType === "domain"
                      ? "例如: google.com"
                      : ruleType === "domain_suffix"
                      ? "例如: github.com"
                      : "例如: 192.168.1.0/24"
                  }
                  className="w-full h-8.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 focus:border-[#007ACC] outline-none transition-all dark:border-white/[0.08] dark:bg-black dark:text-slate-200"
                />
              </div>

              <div className="flex items-start gap-1.5 rounded-[12px] bg-slate-50 border border-slate-200/50 p-2.5 dark:bg-white/[0.03] dark:border-white/[0.06]">
                <AlertCircleIcon className="size-3 text-[#3b59ff] shrink-0 mt-0.5" />
                <div className="text-[8px] text-slate-500 dark:text-slate-400 font-semibold leading-relaxed">
                  {ruleType === "domain" && "域名匹配：仅当目标网络请求域名完全一致时触发（如 www.google.com，不可带协议或端口）。"}
                  {ruleType === "domain_suffix" && "后缀匹配：目标域名以此后缀结束时触发（如 cn 匹配所有以 .cn 结尾的域名）。"}
                  {ruleType === "ip_cidr" && "IP网段：匹配目的 IP 地址属于该网段范围（如 10.0.0.0/8 覆盖 10.0.0.0 至 10.255.255.255）。"}
                </div>
              </div>
            </div>

            <Button
              onClick={handleAddRule}
              className="w-full h-9 rounded-xl bg-gradient-to-r from-[#4d73ff] to-[#254eff] hover:from-[#3b59ff] hover:to-[#1a3fff] text-white font-bold text-xs shadow-md shadow-blue-500/10 cursor-pointer transition-all shrink-0 mt-3"
            >
              <PlusIcon className="size-4 mr-1" />
              添加至当前规则列表
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
