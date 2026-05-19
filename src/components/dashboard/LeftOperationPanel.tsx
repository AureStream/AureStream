import {
  ChevronRight,
  ArrowLeftRight,
  Globe,
  Zap,
  Loader2,
} from "lucide-react";
import { ConnectButton } from "@/components/dashboard/ConnectButton";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { getLatencyColor } from "@/types";
import type { Node } from "@/types";
import { useProxyStore, useAppStore } from "@/stores/appStore";

function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond === 0) return "0 KB/s";
  const k = 1024;
  const sizes = ["B/s", "KB/s", "MB/s", "GB/s"];
  const i = Math.min(
    Math.floor(Math.log(bytesPerSecond) / Math.log(k)),
    sizes.length - 1,
  );
  const v = bytesPerSecond / Math.pow(k, i);
  return `${v.toFixed(1)} ${sizes[i]}`;
}

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

function parseNodeLabels(node?: Node): {
  flag: string;
  primary: string;
  secondary: string;
} {
  if (!node?.name) return { flag: "🌐", primary: "未选择", secondary: "" };
  const parts = node.name
    .split(/·|•/)
    .map((p) => p.trim())
    .filter(Boolean);
  const primary = parts[0] ?? node.name;
  const secondary = parts.slice(1, 3).join(" · ") || node.server;
  const flagMap: Record<string, string> = {
    中国: "🇨🇳",
    香港: "🇭🇰",
    台湾: "🇹🇼",
    日本: "🇯🇵",
    东京: "🇯🇵",
    新加坡: "🇸🇬",
    美国: "🇺🇸",
    英国: "🇬🇧",
    韩国: "🇰🇷",
    德国: "🇩🇪",
    法国: "🇫🇷",
  };
  const flag = flagMap[primary] ?? "🌐";
  return { flag, primary, secondary };
}

export function LeftOperationPanel({
  isConnected,
  canConnect,
  connectedAt,
  nowTick,
  downloadSpeed,
  uploadSpeed,
  currentNode,
  onOpenNodePicker,
}: {
  isConnected: boolean;
  canConnect: boolean;
  connectedAt?: number;
  nowTick: number;
  downloadSpeed: number;
  uploadSpeed: number;
  currentNode?: Node;
  onOpenNodePicker: () => void;
}) {
  const elapsedSec =
    isConnected && connectedAt
      ? Math.max(0, Math.floor((nowTick - connectedAt) / 1000))
      : 0;

  const { proxyMode, setProxyMode } = useAppStore();
  const PROXY_OPTIONS: {
    mode: "rule" | "global" | "direct";
    label: string;
    icon: typeof ArrowLeftRight;
  }[] = [
    { mode: "rule", label: "规则", icon: ArrowLeftRight },
    { mode: "global", label: "全局", icon: Globe },
    { mode: "direct", label: "直连", icon: Zap },
  ];

  const nodeLine = parseNodeLabels(currentNode);

  return (
    <div className="flex h-full flex-col items-center px-4 pt-4 pb-4 sm:pt-6 sm:pb-6 gap-3 sm:gap-4">

      {/* 区域 1：连接时长 / 未连接提示 — grid overlay，高度由内容决定 */}
      <div className="grid w-full max-w-[28rem] shrink-0 place-items-center px-2">
        <p
          className={cn(
            "col-start-1 row-start-1 text-center text-2xl font-semibold tabular-nums leading-none tracking-tight text-foreground transition-opacity duration-300 sm:text-3xl lg:text-[2.5rem]",
            isConnected
              ? "z-10 opacity-100"
              : "z-0 pointer-events-none opacity-0",
          )}
          aria-hidden={!isConnected}
        >
          {formatDuration(elapsedSec)}
        </p>
        <p
          className={cn(
            "col-start-1 row-start-1 text-center text-xs leading-snug text-muted-foreground transition-opacity duration-300 sm:text-sm",
            !isConnected
              ? "z-10 opacity-100"
              : "z-0 pointer-events-none opacity-0",
          )}
          aria-hidden={isConnected}
        >
          你好，连接成功后，我会在这里帮你记录本次在线时长～
        </p>
      </div>

      {/* 区域 2：连接按钮 — flex-1 填充剩余高度，按钮居中 */}
      <div className="flex w-full flex-1 min-h-[8rem] items-center justify-center">
        <ConnectButton
          disabled={!canConnect}
          size="default"
          className="flex lg:hidden"
          proxyMode={
            proxyMode === "rule"
              ? "规则"
              : proxyMode === "global"
                ? "全局"
                : "直连"
          }
        />
        <ConnectButton
          disabled={!canConnect}
          size="lg"
          className="hidden lg:flex"
          proxyMode={
            proxyMode === "rule"
              ? "规则"
              : proxyMode === "global"
                ? "全局"
                : "直连"
          }
        />
      </div>

      {/* 区域 3：实时速率 / 未连接提示 — grid overlay */}
      <div className="grid w-full max-w-[28rem] shrink-0 place-items-center px-2">
        <div
          className={cn(
            "col-start-1 row-start-1 flex items-center justify-center transition-opacity duration-300",
            isConnected
              ? "z-10 opacity-100"
              : "z-0 pointer-events-none opacity-0",
          )}
          aria-hidden={!isConnected}
        >
          <div className="inline-flex items-center gap-2.5 rounded-full border border-border/70 bg-muted/45 px-3 py-1.5 text-xs tabular-nums text-muted-foreground sm:gap-3 sm:px-4 sm:py-2 sm:text-sm">
            <span className="inline-flex items-center gap-1.5">
              <span className="text-foreground/70" aria-hidden>↓</span>
              <span className="font-medium text-foreground">
                {formatSpeed(downloadSpeed)}
              </span>
            </span>
            <Separator orientation="vertical" className="h-4 bg-border/80" decorative />
            <span className="inline-flex items-center gap-1.5">
              <span className="text-foreground/70" aria-hidden>↑</span>
              <span className="font-medium text-foreground">
                {formatSpeed(uploadSpeed)}
              </span>
            </span>
          </div>
        </div>
        <p
          className={cn(
            "col-start-1 row-start-1 text-center text-[11px] leading-snug text-muted-foreground transition-opacity duration-300 sm:text-xs",
            !isConnected
              ? "z-10 opacity-100"
              : "z-0 pointer-events-none opacity-0",
          )}
          aria-hidden={isConnected}
        >
          你好，连上之后就能在这里看到实时上下行速率啦～
        </p>
      </div>

      {/* 区域 4：代理模式 ↔ 节点信息 — grid overlay */}
      <div className="grid w-full max-w-[28rem] shrink-0">
        <div
          className={cn(
            "col-start-1 row-start-1 flex w-full items-center px-2 transition-opacity duration-300",
            isConnected
              ? "z-10 opacity-100"
              : "pointer-events-none z-0 opacity-0",
          )}
          aria-hidden={!isConnected}
        >
          <Button
            type="button"
            variant="outline"
            onClick={onOpenNodePicker}
            className="group flex h-14 w-full max-w-[28rem] items-center justify-between gap-2 rounded-full px-3 text-left font-normal sm:h-16 sm:px-4"
          >
            <div className="flex w-[80%] items-center gap-2">
              <span className="text-xl leading-none shrink-0" aria-hidden>
                {nodeLine.flag}
              </span>
              <div className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold leading-tight text-foreground sm:text-sm">
                  {nodeLine.primary}
                </span>
                {nodeLine.secondary && (
                  <span className="block truncate text-[9px] leading-tight text-muted-foreground sm:text-[10px]">
                    · {nodeLine.secondary}
                  </span>
                )}
              </div>
            </div>
            <div className="flex w-[20%] items-center justify-end gap-1">
              {useProxyStore.getState().isTestingLatency ? (
                <Loader2 className="size-3 animate-spin text-muted-foreground" />
              ) : currentNode?.delay != null ? (
                <span
                  className={cn(
                    "text-[10px] font-semibold tabular-nums",
                    getLatencyColor(currentNode.delay),
                  )}
                >
                  {currentNode.delay} ms
                </span>
              ) : null}
              <ChevronRight
                className="size-3 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                aria-hidden
              />
            </div>
          </Button>
        </div>

        <div
          className={cn(
            "col-start-1 row-start-1 flex w-full items-center px-2 transition-opacity duration-300",
            !isConnected
              ? "z-10 opacity-100"
              : "pointer-events-none z-0 opacity-0",
          )}
          aria-hidden={isConnected}
        >
          <div className="flex w-full flex-col gap-2">
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {PROXY_OPTIONS.map(({ mode, label, icon: Icon }) => (
                <button
                  key={mode}
                  type="button"
                  disabled={mode === "global"}
                  onClick={() => setProxyMode(mode)}
                  className={cn(
                    "flex cursor-pointer items-center justify-center gap-2 rounded-xl px-3 py-2.5 transition-all duration-200",
                    proxyMode === mode
                      ? "bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/20"
                      : "bg-muted/35 text-muted-foreground hover:bg-muted/55 hover:text-foreground",
                    mode === "global" &&
                      "opacity-50 cursor-not-allowed grayscale",
                  )}
                  aria-pressed={proxyMode === mode}
                >
                  <Icon className="size-4 shrink-0" strokeWidth={1.75} />
                  <span className="truncate text-xs font-semibold">
                    {label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
