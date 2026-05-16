import { CreditCard } from "lucide-react";
import { TrafficUsageRing } from "@/components/dashboard/TrafficUsageRing";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { Provider } from "@/types";

function formatExpiry(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatTrafficGB(gb?: number): string {
  if (gb == null || !Number.isFinite(gb)) return "—";
  return `${gb.toFixed(1)} GB`;
}

export function SubscriptionBlock({
  provider,
  onOpenProviders,
  className,
}: {
  provider?: Provider;
  onOpenProviders?: () => void;
  className?: string;
}) {
  const trafficTotal = provider?.trafficTotalGB;
  const trafficUsed = provider?.trafficUsedGB;
  const trafficRemaining =
    trafficTotal != null &&
    trafficTotal > 0 &&
    trafficUsed != null &&
    Number.isFinite(trafficUsed)
      ? Math.max(0, trafficTotal - trafficUsed)
      : undefined;
  const trafficPct =
    trafficTotal != null &&
    trafficTotal > 0 &&
    trafficUsed != null &&
    Number.isFinite(trafficUsed)
      ? Math.min(100, Math.max(0, (trafficUsed / trafficTotal) * 100))
      : undefined;

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {provider ? (
        <div className="flex flex-col gap-3 min-h-[9rem] sm:min-h-[10rem] lg:min-h-[12rem]">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <CreditCard className="size-4 text-primary" strokeWidth={1.75} />
            </div>
            <p className="min-w-0 truncate text-sm font-semibold text-foreground">
              {provider.name?.trim() || "—"}
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex flex-1 flex-col gap-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">总流量</span>
                <span className="font-medium tabular-nums text-foreground">
                  {formatTrafficGB(trafficTotal)}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">已用流量</span>
                <span className="font-medium tabular-nums text-foreground">
                  {formatTrafficGB(trafficUsed)}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">剩余流量</span>
                <span className="font-medium tabular-nums text-foreground">
                  {trafficRemaining != null
                    ? `${trafficRemaining.toFixed(1)} GB`
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">到期时间</span>
                <span className="font-medium tabular-nums text-foreground">
                  {formatExpiry(provider.expiresAt)}
                </span>
              </div>
            </div>
            {trafficPct != null ? (
              <TrafficUsageRing pct={trafficPct} className="shrink-0" />
            ) : null}
          </div>
          {trafficPct != null ? (
            <div className="flex items-center gap-4">
              <Progress
                value={trafficPct}
                className="h-1.5 flex-1"
                aria-label="流量使用进度"
              />
              <span className="w-[5rem] sm:w-[6.5rem] lg:w-[8.5rem] shrink-0 text-center text-[10px] font-medium text-muted-foreground">
                用量占比
              </span>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/50 bg-muted/15 px-4 py-6 text-center min-h-[9rem] sm:min-h-[10rem] lg:min-h-[12rem] justify-center">
          <p className="text-xs font-medium text-muted-foreground">
            尚未选择供应商
          </p>
          <p className="text-[11px] text-muted-foreground/70">
            导入订阅后在此查看套餐信息与用量
          </p>
          {onOpenProviders ? (
            <Button
              variant="secondary"
              size="sm"
              className="rounded-lg"
              onClick={onOpenProviders}
            >
              选择服务商
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
