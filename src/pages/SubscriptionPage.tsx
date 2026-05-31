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
  CheckCircle2Icon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

import { useSubscriptions } from "@/hooks/useSubscriptions"
import { insertSubscription, deleteSubscription, updateSubscription } from "@/action/db"
import { message } from "@tauri-apps/plugin-dialog"

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

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 GB"
  const gb = bytes / (1024 * 1024 * 1024)
  if (gb < 0.01) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${gb.toFixed(1)} GB`
}

function formatExpiry(expireTimeMs: number): string {
  if (!expireTimeMs || expireTimeMs <= 0) return "无限期"
  const date = new Date(expireTimeMs)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function getStatus(expireTimeMs: number): "active" | "expired" | "expiring" {
  if (!expireTimeMs || expireTimeMs <= 0) return "active"
  const now = Date.now()
  if (expireTimeMs <= now) return "expired"
  if (expireTimeMs - now < 7 * 24 * 3600 * 1000) return "expiring"
  return "active"
}

export function SubscriptionPage() {
  const {
    subscriptions,
    activeIdentifier,
    loading,
    refresh,
    selectSubscription,
  } = useSubscriptions()

  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [autoUpdate, setAutoUpdate] = useState(true)
  const [updateInterval, setUpdateInterval] = useState<"6h" | "12h" | "24h" | "7d">("24h")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isUpdatingAll, setIsUpdatingAll] = useState(false)

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url || isSubmitting) return
    setIsSubmitting(true)
    try {
      const finalName = name.trim() || getFriendlyNameFromUrl(url)
      const id = await insertSubscription(url, finalName)
      if (id) {
        await selectSubscription(id)
        setName("")
        setUrl("")
        await refresh()
      } else {
        await message("无法解析订阅文件，请检查您的订阅链接是否有效", {
          title: "导入失败",
          kind: "error",
        })
      }
    } catch (err: any) {
      console.error(err)
      await message(`添加失败: ${err.message || err}`, {
        title: "错误",
        kind: "error",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (identifier: string) => {
    try {
      await deleteSubscription(identifier)
      await refresh()
    } catch (err) {
      console.error(err)
    }
  }

  const handleSingleUpdate = async (identifier: string) => {
    try {
      const ok = await updateSubscription(identifier)
      if (ok) {
        await refresh()
      } else {
        await message("更新订阅失败，请检查网络或订阅链接是否有效", {
          title: "更新失败",
          kind: "error",
        })
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleUpdateAll = async () => {
    if (isUpdatingAll) return
    setIsUpdatingAll(true)
    try {
      for (const sub of subscriptions) {
        await updateSubscription(sub.identifier)
      }
      await refresh()
    } catch (err) {
      console.error(err)
    } finally {
      setIsUpdatingAll(false)
    }
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.22fr)_minmax(0,0.78fr)] gap-3 sm:gap-5">
      {/* Left side: Subscription list */}
      <div className="flex min-h-0 flex-col gap-3 sm:gap-4 overflow-hidden">
        <Card className="flex min-h-0 flex-1 flex-col rounded-[20px] overflow-hidden">
          <div className="flex items-center justify-between px-3 sm:px-4 pt-3.5 pb-2.5">
            <div className="flex items-center gap-1.5">
              <div className="flex size-7 items-center justify-center rounded-lg bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400">
                <BoxIcon className="size-4" />
              </div>
              <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">已保存的订阅</span>
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500 dark:bg-white/[0.06] dark:text-slate-400">
                共 {subscriptions.length} 个
              </span>
            </div>
            <Button
              variant="ghost"
              size="xs"
              onClick={handleUpdateAll}
              disabled={isUpdatingAll || subscriptions.length === 0}
              className="h-7 px-2 rounded-lg bg-[#eef2ff] text-[#3b59ff] text-[10px] font-bold hover:bg-blue-100/60 dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20 transition-colors"
            >
              <RefreshCwIcon className={cn("size-3.5 mr-0.5", isUpdatingAll && "animate-spin")} />
              {isUpdatingAll ? "更新中..." : "全部更新"}
            </Button>
          </div>

          <CardContent className="flex min-h-0 flex-1 flex-col pt-0 overflow-hidden">
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-2 scrollbar-thin flex flex-col gap-3 pb-4">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2 py-8">
                  <span className="text-xs">加载中...</span>
                </div>
              ) : subscriptions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2 py-8">
                  <AlertCircleIcon className="size-8 text-slate-300 dark:text-slate-600" />
                  <span className="text-xs">暂无可用订阅，请在右侧添加</span>
                </div>
              ) : (
                subscriptions.map((sub) => {
                  const percent = sub.total_traffic > 0 ? (sub.used_traffic / sub.total_traffic) * 100 : 0
                  const isCurrent = sub.identifier === activeIdentifier
                  const status = getStatus(sub.expire_time)
                  return (
                    <div
                      key={sub.identifier}
                      onClick={() => selectSubscription(sub.identifier)}
                      className={cn(
                        "flex flex-col gap-2 rounded-[16px] border p-3.5 transition-all duration-200 cursor-pointer",
                        isCurrent
                          ? "bg-[#eef2ff] border-[#007ACC]/30 shadow-[0_2px_8px_rgba(0,122,204,0.08)] dark:bg-blue-500/10 dark:border-blue-500/35"
                          : status === "expired"
                          ? "bg-white/90 border-slate-200/60 shadow-[0_2px_8px_rgba(15,23,42,0.02)] opacity-60 dark:bg-white/[0.02] dark:border-white/[0.04]"
                          : "bg-white/90 border-slate-200/60 shadow-[0_2px_8px_rgba(15,23,42,0.03)] hover:shadow-[0_4px_12px_rgba(15,23,42,0.06)] hover:bg-white dark:bg-white/[0.03] dark:border-white/[0.06] dark:hover:bg-white/[0.06]"
                      )}
                    >
                      {/* Subscription Info Header */}
                      <div className="flex items-start justify-between gap-3 min-w-0">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                              {sub.name}
                            </span>
                            <span
                              className={cn(
                                "rounded-md px-1.5 py-0.5 text-[9px] font-bold shrink-0",
                                status === "active" && "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
                                status === "expiring" && "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
                                status === "expired" && "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400"
                              )}
                            >
                              {status === "active" && "服务中"}
                              {status === "expiring" && "即将过期"}
                              {status === "expired" && "已过期"}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                            <LinkIcon className="size-3 shrink-0" />
                            <span className="truncate">{sub.subscription_url}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {isCurrent && (
                            <div className="flex items-center gap-1 px-2 h-6 rounded-md bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 text-[9px] font-bold">
                              <CheckCircle2Icon className="size-3" />
                              使用中
                            </div>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-white/[0.08] dark:hover:text-slate-300 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleSingleUpdate(sub.identifier)
                            }}
                            aria-label="更新订阅"
                          >
                            <RefreshCwIcon className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 rounded-lg text-rose-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDelete(sub.identifier)
                            }}
                            aria-label="删除订阅"
                          >
                            <Trash2Icon className="size-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Traffic progress */}
                      <div className="flex flex-col gap-1.5 mt-1">
                        <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                          <span>已使用: {formatBytes(sub.used_traffic)} / {formatBytes(sub.total_traffic)}</span>
                          <span className={cn(percent > 85 ? "text-rose-500" : percent > 60 ? "text-amber-500" : "text-[#3b59ff]")}>
                            {percent.toFixed(1)}%
                          </span>
                        </div>
                        <Progress
                          value={percent}
                          className={cn(
                            "h-1.5 bg-slate-100 dark:bg-white/[0.06]",
                            status === "expired"
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
                      <div className="flex items-center justify-between mt-1 pt-1.5 border-t border-slate-200/50 dark:border-white/[0.06] text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                        <span className="flex items-center gap-1">
                          <CalendarIcon className="size-3" />
                          到期时间: {formatExpiry(sub.expire_time)}
                        </span>
                        <span className="flex items-center gap-1">
                          <span className={cn("size-1.5 rounded-full", autoUpdate ? "bg-emerald-500" : "bg-slate-350 dark:bg-slate-600")} />
                          自动更新: {autoUpdate ? updateInterval : "关闭"}
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
        <Card className="shrink-0 rounded-[20px]">
          <CardContent className="flex flex-col gap-3.5 py-4 px-4">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                <PlusIcon className="size-4" />
              </div>
              <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">添加订阅</span>
            </div>

            <form onSubmit={handleAdd} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">订阅名称 (可选)</label>
                <input
                  type="text"
                  placeholder="不填将依据链接自动识别"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-8.5 rounded-lg border border-slate-200 bg-[#f8fafc]/30 px-3 text-xs text-slate-800 placeholder-slate-400 focus:border-[#3b59ff] focus:bg-white outline-none transition-all dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-slate-200 dark:placeholder-slate-500 dark:focus:border-blue-500 dark:focus:bg-slate-900"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-500">订阅链接 (URL)</label>
                <textarea
                  placeholder="粘贴您的 v2ray/clash 订阅链接..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  rows={3}
                  className="rounded-lg border border-slate-200 bg-[#f8fafc]/30 p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-[#3b59ff] focus:bg-white outline-none transition-all resize-none dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-slate-200 dark:placeholder-slate-500 dark:focus:border-blue-500 dark:focus:bg-slate-900"
                  required
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-slate-200/60 bg-white/40 px-3 py-2 mt-0.5 dark:border-white/[0.08] dark:bg-white/[0.04]">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400">自动更新</span>
                  <span className="text-[9px] text-slate-500 dark:text-slate-400">开启后将定时同步节点</span>
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
                            ? "border-[#3b59ff] bg-[#eef2ff] text-[#3b59ff] dark:border-blue-500 dark:bg-blue-500/10 dark:text-blue-400"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/[0.1] dark:bg-white/[0.06] dark:text-slate-400 dark:hover:bg-white/[0.1]"
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
                disabled={isSubmitting}
                className="w-full h-8.5 rounded-lg bg-[#3b59ff] text-white hover:bg-[#3b59ff]/90 font-semibold text-xs shadow-sm mt-1 transition-all dark:bg-blue-600 dark:hover:bg-blue-700"
              >
                {isSubmitting ? "正在拉取..." : "保存订阅"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Tip / Info Card */}
        <Card className="flex-1 rounded-[20px] overflow-hidden">
          <CardContent className="flex flex-col gap-3.5 py-4 px-4 h-full">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
                <ShieldCheckIcon className="size-4" />
              </div>
              <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">订阅说明</span>
            </div>

            <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed font-medium space-y-2.5">
              <p>1. 支持各大网络代理 service 商的标准 Clash/v2ray 订阅协议格式。</p>
              <p>2. 请务必保管好您的订阅地址链接，切勿随意分享给他人以免造成流量泄露。</p>
              <p>3. 订阅更新时将自动同步最新的服务器节点，请保持网络连接通畅。</p>
              <p>4. 当流量耗尽或接近过期时，订阅状态会自动变色提醒。</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
