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

function formatExpiry(expireTimeMs: number, t: (key: string) => string): string {
  if (!expireTimeMs || expireTimeMs <= 0) return t("unlimited")
  const date = new Date(expireTimeMs)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
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

      <CardFooter className="flex items-center justify-between pb-3 pt-1 px-4 type-caption">
        <span className="font-semibold text-primary">
          {usedPercent.toFixed(1)}% {t("used_percent")}
        </span>
        <div className="flex items-center gap-2">
          <span className={type.mono}>{t("expire")} {active ? formatExpiry(active.expire_time, t) : t("unlimited")}</span>
          <Button variant="ghost" size="xs" className={cn(btn.accent, "h-7 px-2")}>
            {t("manage")}
          </Button>
        </div>
      </CardFooter>
    </Card>
  )
}
