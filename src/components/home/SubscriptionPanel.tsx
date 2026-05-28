import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { useSubscriptions } from "@/hooks/useSubscriptions"

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 GB"
  const gb = bytes / (1024 * 1024 * 1024)
  if (gb < 0.01) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${gb.toFixed(1)} GB`
}

function formatExpiry(expireTimeMs: number): string {
  if (!expireTimeMs || expireTimeMs <= 0) return "无限期"
  const date = new Date(expireTimeMs)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

export function SubscriptionPanel() {
  const { subscriptions, activeIdentifier, loading } = useSubscriptions()
  const active = subscriptions.find(s => s.identifier === activeIdentifier) || subscriptions[0]
  const usedPercent =
    active && active.total_traffic > 0
      ? (active.used_traffic / active.total_traffic) * 100
      : 0

  return (
    <Card className="shrink-0 rounded-[20px] shadow-sm">
      <CardHeader className="pb-0 pt-3 px-4">
        <CardTitle className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
          {loading
            ? "加载中..."
            : active?.name ?? "暂无订阅"}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 pt-2 px-4">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-400">
          <span>已用 {active ? formatBytes(active.used_traffic) : "0 GB"}</span>
          <span>共 {active ? formatBytes(active.total_traffic) : "0 GB"}</span>
        </div>
        <Progress
          value={usedPercent}
          className="h-1.5 bg-slate-100 dark:bg-white/[0.06] [&>div]:bg-[#3b59ff]"
        />
      </CardContent>

      <CardFooter className="flex items-center justify-between pb-3 pt-1 px-4 text-xs font-medium text-slate-500 dark:text-slate-400">
        <span className="text-[#3b59ff] dark:text-blue-400">
          {usedPercent.toFixed(1)}% 已使用
        </span>
        <div className="flex items-center gap-2">
          <span>
            到期 {active ? formatExpiry(active.expire_time) : "无限期"}
          </span>
          <Button
            variant="ghost"
            size="xs"
            className="h-6 px-2 rounded-md bg-[#eef2ff] text-[#3b59ff] text-[10px] font-semibold hover:bg-blue-100/60 dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20 transition-colors"
          >
            管理
          </Button>
        </div>
      </CardFooter>
    </Card>
  )
}
