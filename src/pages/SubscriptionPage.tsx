import { useState } from "react"
import {
  BoxIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
  LinkIcon,
  CalendarIcon,
  ShieldCheckIcon,
  AlertCircleIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

interface Subscription {
  id: string
  name: string
  url: string
  usedTraffic: number // in GB
  totalTraffic: number // in GB
  expirationDate: string
  status: "active" | "expired" | "expiring"
  autoUpdate: boolean
  updateInterval: "6h" | "12h" | "24h" | "7d"
}

const getFriendlyNameFromUrl = (urlStr: string): string => {
  try {
    const parsed = new URL(urlStr)
    const pathname = parsed.pathname
    const segments = pathname.split("/").filter(Boolean)
    if (segments.length > 0) {
      const lastSegment = segments[segments.length - 1]
      const cleanName = lastSegment.split("?")[0].replace(/\.(yaml|yml|ini|txt|conf)$/i, "")
      if (cleanName && cleanName !== "subscribe" && cleanName !== "sub") {
        return decodeURIComponent(cleanName)
      }
    }
    const hostname = parsed.hostname
    const hostParts = hostname.split(".")
    if (hostParts.length > 1) {
      const domain = hostParts[hostParts.length - 2]
      if (domain && domain !== "com" && domain !== "net" && domain !== "org") {
        return domain.toUpperCase() + " 订阅"
      }
    }
    return parsed.hostname + " 订阅"
  } catch (e) {
    return "未命名订阅"
  }
}

export function SubscriptionPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([
    {
      id: "1",
      name: "CM 订阅 1",
      url: "https://sub.cm.link/v2/subscribe?token=a8f9c73...",
      usedTraffic: 34.5,
      totalTraffic: 100,
      expirationDate: "2026-07-15",
      status: "active",
      autoUpdate: true,
      updateInterval: "24h",
    },
    {
      id: "2",
      name: "AureStream 高级节点订阅",
      url: "https://aurestream.net/api/v1/sub?user=wry&pass=...",
      usedTraffic: 245.2,
      totalTraffic: 500,
      expirationDate: "2026-06-05",
      status: "expiring",
      autoUpdate: true,
      updateInterval: "12h",
    },
    {
      id: "3",
      name: "免费试用节点",
      url: "https://free.nodes-list.xyz/sub",
      usedTraffic: 10,
      totalTraffic: 10,
      expirationDate: "2026-05-26",
      status: "expired",
      autoUpdate: false,
      updateInterval: "24h",
    },
  ])

  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [autoUpdate, setAutoUpdate] = useState(true)
  const [updateInterval, setUpdateInterval] = useState<"6h" | "12h" | "24h" | "7d">("24h")

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault()
    if (!url) return
    const finalName = name.trim() || getFriendlyNameFromUrl(url)
    const newSub: Subscription = {
      id: Date.now().toString(),
      name: finalName,
      url,
      usedTraffic: 0,
      totalTraffic: 200,
      expirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      status: "active",
      autoUpdate,
      updateInterval,
    }
    setSubscriptions([newSub, ...subscriptions])
    setName("")
    setUrl("")
    setAutoUpdate(true)
    setUpdateInterval("24h")
  }

  const handleDelete = (id: string) => {
    setSubscriptions(subscriptions.filter((sub) => sub.id !== id))
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.22fr)_minmax(0,0.78fr)] gap-4 sm:gap-5">
      {/* Left side: Subscription list */}
      <div className="flex min-h-0 flex-col gap-3 sm:gap-4 overflow-hidden">
        <Card className="flex min-h-0 flex-1 flex-col border border-slate-100 rounded-[20px] shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-3 sm:px-4 pt-3.5 pb-2.5">
            <div className="flex items-center gap-1.5">
              <div className="flex size-7 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
                <BoxIcon className="size-4" />
              </div>
              <span className="text-xs sm:text-sm font-bold text-slate-800">已保存的订阅</span>
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">
                共 {subscriptions.length} 个
              </span>
            </div>
            <Button variant="ghost" size="xs" className="h-7 px-2 rounded-lg bg-[#eef2ff] text-[#3b59ff] text-[10px] font-bold hover:bg-blue-100/60 transition-colors">
              <RefreshCwIcon className="size-3.5 mr-0.5" />
              全部更新
            </Button>
          </div>

          <CardContent className="flex min-h-0 flex-1 flex-col pt-0 overflow-hidden">
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-2 scrollbar-thin flex flex-col gap-3 pb-4">
              {subscriptions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2 py-8">
                  <AlertCircleIcon className="size-8 text-slate-300" />
                  <span className="text-xs">暂无可用订阅，请在右侧添加</span>
                </div>
              ) : (
                subscriptions.map((sub) => {
                  const percent = (sub.usedTraffic / sub.totalTraffic) * 100
                  return (
                    <div
                      key={sub.id}
                      className={cn(
                        "flex flex-col gap-2 rounded-[16px] border p-3.5 bg-[#f8fafc]/30 border-slate-100 hover:bg-[#f8fafc]/60 transition-all duration-200"
                      )}
                    >
                      {/* Subscription Info Header */}
                      <div className="flex items-start justify-between gap-3 min-w-0">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-800 truncate">
                              {sub.name}
                            </span>
                            <span
                              className={cn(
                                "rounded-md px-1.5 py-0.5 text-[9px] font-bold shrink-0",
                                sub.status === "active" && "bg-emerald-50 text-emerald-600",
                                sub.status === "expiring" && "bg-amber-50 text-amber-600",
                                sub.status === "expired" && "bg-rose-50 text-rose-600"
                              )}
                            >
                              {sub.status === "active" && "服务中"}
                              {sub.status === "expiring" && "即将过期"}
                              {sub.status === "expired" && "已过期"}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-400 font-medium">
                            <LinkIcon className="size-3 shrink-0" />
                            <span className="truncate">{sub.url}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button variant="ghost" size="icon" className="size-7 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors" aria-label="更新订阅">
                            <RefreshCwIcon className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 rounded-lg text-rose-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                            onClick={() => handleDelete(sub.id)}
                            aria-label="删除订阅"
                          >
                            <Trash2Icon className="size-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Traffic progress */}
                      <div className="flex flex-col gap-1.5 mt-1">
                        <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500">
                          <span>已使用: {sub.usedTraffic} GB / {sub.totalTraffic} GB</span>
                          <span className={cn(percent > 85 ? "text-rose-500" : percent > 60 ? "text-amber-500" : "text-[#3b59ff]")}>
                            {percent.toFixed(1)}%
                          </span>
                        </div>
                        <Progress
                          value={percent}
                          className={cn(
                            "h-1.5 bg-slate-100",
                            sub.status === "expired"
                              ? "[&>div]:bg-rose-500"
                              : percent > 85
                              ? "[&>div]:bg-rose-500"
                              : percent > 60
                              ? "[&>div]:bg-amber-500"
                              : "[&>div]:bg-[#3b59ff]"
                          )}
                        />
                      </div>

                      {/* Footer Info */}
                      <div className="flex items-center justify-between mt-1 pt-1.5 border-t border-slate-100/60 text-[10px] text-slate-400 font-medium">
                        <span className="flex items-center gap-1">
                          <CalendarIcon className="size-3" />
                          到期时间: {sub.expirationDate}
                        </span>
                        <span className="flex items-center gap-1">
                          <span className={cn("size-1.5 rounded-full", sub.autoUpdate ? "bg-emerald-500" : "bg-slate-300")} />
                          自动更新: {sub.autoUpdate ? sub.updateInterval : "关闭"}
                        </span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right side: Add subscription & Info card */}
      <div className="flex min-h-0 flex-col gap-3 sm:gap-4 overflow-hidden">
        {/* Add subscription Form */}
        <Card className="shrink-0 border border-slate-100 rounded-[20px] shadow-sm">
          <CardContent className="flex flex-col gap-3.5 py-4 px-4">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <PlusIcon className="size-4" />
              </div>
              <span className="text-xs sm:text-sm font-bold text-slate-800">添加订阅</span>
            </div>

            <form onSubmit={handleAdd} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-500">订阅名称 (可选)</label>
                <input
                  type="text"
                  placeholder="不填将依据链接自动识别"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-8.5 rounded-lg border border-slate-200 bg-[#f8fafc]/30 px-3 text-xs text-slate-800 placeholder-slate-400 focus:border-[#3b59ff] focus:bg-white outline-none transition-all"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-500">订阅链接 (URL)</label>
                <textarea
                  placeholder="粘贴您的 v2ray/clash 订阅链接..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  rows={3}
                  className="rounded-lg border border-slate-200 bg-[#f8fafc]/30 p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-[#3b59ff] focus:bg-white outline-none transition-all resize-none"
                  required
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-[#f8fafc]/30 px-3 py-2 mt-0.5">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-600">自动更新</span>
                  <span className="text-[9px] text-slate-400">开启后将定时同步节点</span>
                </div>
                <Switch size="sm" checked={autoUpdate} onCheckedChange={setAutoUpdate} />
              </div>

              {autoUpdate && (
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-500">更新周期</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(["6h", "12h", "24h", "7d"] as const).map((interval) => (
                      <button
                        key={interval}
                        type="button"
                        onClick={() => setUpdateInterval(interval)}
                        className={cn(
                          "h-7 rounded-md border text-[10px] font-bold transition-all cursor-pointer",
                          updateInterval === interval
                            ? "border-[#3b59ff] bg-[#eef2ff] text-[#3b59ff]"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        )}
                      >
                        {interval === "6h" && "6小时"}
                        {interval === "12h" && "12小时"}
                        {interval === "24h" && "每天"}
                        {interval === "7d" && "每周"}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-8.5 rounded-lg bg-[#3b59ff] text-white hover:bg-[#3b59ff]/90 font-semibold text-xs shadow-sm mt-1 transition-all"
              >
                保存订阅
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Tip / Info Card */}
        <Card className="flex-1 border border-slate-100 rounded-[20px] shadow-sm overflow-hidden">
          <CardContent className="flex flex-col gap-3.5 py-4 px-4 h-full">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <ShieldCheckIcon className="size-4" />
              </div>
              <span className="text-xs sm:text-sm font-bold text-slate-800">订阅说明</span>
            </div>
            
            <div className="text-[11px] text-slate-500 leading-relaxed font-medium space-y-2.5">
              <p>1. 支持各大网络代理服务商的标准 Clash/v2ray 订阅协议格式。</p>
              <p>2. 请务必保管好您的订阅地址链接，切勿随意分享给他人以免造成带宽泄露。</p>
              <p>3. 订阅更新时将自动同步最新的服务器节点，请保持网络连接通畅。</p>
              <p>4. 当流量耗尽或接近过期时，订阅状态会自动变色提醒。</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
