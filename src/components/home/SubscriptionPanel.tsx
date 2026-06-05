import { Button } from "@/components/ui/button"
import { useTranslation } from "react-i18next"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { useSubscriptions } from "@/hooks/useSubscriptions"
import { btn, type } from "@/lib/typography"
import { cn } from "@/lib/utils"

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 GB"
  const gb = bytes / (1024 * 1024 * 1024)
  if (gb < 0.01) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${gb.toFixed(1)} GB`
}

function formatExpiry(expireTimeMs: number | null | undefined): string {
  let date: Date
  if (!expireTimeMs || expireTimeMs <= 0) {
    date = new Date()
    date.setFullYear(date.getFullYear() + 100)
  } else {
    date = new Date(expireTimeMs)
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function formatRefreshTime(lastUpdateTimeSecs: number | null | undefined, t: (key: string) => string): string {
  if (!lastUpdateTimeSecs || lastUpdateTimeSecs <= 0) return t("never")
  const date = new Date(lastUpdateTimeSecs * 1000)
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}

export function SubscriptionPanel() {
  const { t } = useTranslation()
  const { subscriptions, activeIdentifier, loading } = useSubscriptions()
  const active = subscriptions.find(s => s.identifier === activeIdentifier) || subscriptions[0]
  const usedPercent =
    active && active.total_traffic > 0
      ? (active.used_traffic / active.total_traffic) * 100
      : 0

  return (
    <Card className="shrink-0 rounded-[20px] shadow-sm">
      <CardHeader className="pb-0 pt-3 px-4">
        <CardTitle className="truncate">
          {loading ? t("loading") : active?.name ?? t("no_subscription")}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 pt-2 px-4">
        <div className={cn("flex items-center justify-between", type.mono)}>
          <span>{t("used")} {active ? formatBytes(active.used_traffic) : "0 GB"}</span>
          <span>{t("total")} {active ? formatBytes(active.total_traffic) : "0 GB"}</span>
        </div>
        <Progress
          value={usedPercent}
          className="h-1.5 bg-muted [&>div]:bg-primary"
        />
      </CardContent>

      <CardFooter className="flex items-center justify-between pb-3 pt-1 px-4 type-caption gap-2">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="font-semibold text-primary">
            {usedPercent.toFixed(1)}% {t("used_percent")}
          </span>
          <div className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] text-muted-foreground", type.mono)}>
            <span>{t("expire")}: {formatExpiry(active?.expire_time)}</span>
            <span className="text-border/60">|</span>
            <span>{t("update_subscription") ? "更新" : "Update"}: {active ? formatRefreshTime(active.last_update_time, t) : t("never")}</span>
          </div>
        </div>
        <Button variant="ghost" size="xs" className={cn(btn.accent, "h-7 px-2 shrink-0")}>
          {t("manage")}
        </Button>
      </CardFooter>
    </Card>
  )
}
