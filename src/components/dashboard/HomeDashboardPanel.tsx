import {
  useEffect,
  useState,
  useMemo,
  useRef,
  useLayoutEffect,
  useId,
} from "react";
import {
  Power,
  ChevronRight,
  Loader2,
  RefreshCw,
  Activity,
  ArrowDown01,
  ArrowDownAZ,
  Package,
  Compass,
  Shield,
  Lock,
} from "lucide-react";
import { useProxyStore, useAppStore } from "@/stores/appStore";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { logErrorDetail, userFacingMessage } from "@/lib/userErrors";

export type HomeDashboardLayout = "mobile" | "desktop";

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

function parseNodeLabels(nodeName?: string, nodeServer?: string): {
  flag: string;
  primary: string;
  secondary: string;
} {
  if (!nodeName) return { flag: "🌐", primary: "未选择节点", secondary: "" };
  const parts = nodeName
    .split(/·|•/)
    .map((p) => p.trim())
    .filter(Boolean);
  const primary = parts[0] ?? nodeName;
  const secondary = parts.slice(1, 3).join(" · ") || nodeServer || "";
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

export interface HomeDashboardPanelProps {
  onOpenProviders?: () => void;
  layout?: HomeDashboardLayout;
}

export function HomeDashboardPanel({
  onOpenProviders,
  layout = "mobile",
}: HomeDashboardPanelProps) {
  const spinGradientId = useId().replace(/:/g, "");

  const {
    currentProvider,
    currentNode,
    isConnected,
    isConnecting,
    isDisconnecting,
    connectedAt,
    connect,
    disconnect,
    nodes,
    applyNodeSelection,
    refreshSubscriptionNodesFromDb,
    testLatency,
    isTestingLatency,
    latencyPendingByNodeId,
  } = useProxyStore();

  const {
    smartRoute,
    smartAdBlock,
    setSmartRoute,
    setSmartAdBlock,
  } = useAppStore();
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [sortBy, setSortBy] = useState<"name" | "delay">("delay");
  const [frozenIds, setFrozenIds] = useState<string[] | null>(null);
  const wasTestingRef = useRef(false);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsedSec =
    isConnected && connectedAt
      ? Math.max(0, Math.floor((nowTick - connectedAt) / 1000))
      : 0;

  const nodeLine = parseNodeLabels(currentNode?.name, currentNode?.server);
  const canConnect = Boolean(currentProvider);
  const busy = isConnecting || isDisconnecting;

  const handleConnectionToggle = async () => {
    if (isConnected) {
      if (busy) return;
      try {
        await disconnect();
      } catch (e) {
        logErrorDetail("HomeDashboardPanel.disconnect", e);
        toast.error(userFacingMessage("disconnect"));
      }
      return;
    }
    if (!canConnect || isConnecting) return;
    try {
      await connect();
    } catch (e) {
      logErrorDetail("HomeDashboardPanel.connect", e);
      toast.error(userFacingMessage("connect"));
    }
  };

  const activeNodes = useMemo(() => {
    return currentProvider
      ? nodes.filter((n) => n.providerId === currentProvider.id && n.enabled)
      : [];
  }, [nodes, currentProvider]);

  const sortedList = useMemo(() => {
    const arr = [...activeNodes];
    if (sortBy === "name") {
      arr.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
    } else {
      arr.sort((a, b) => {
        const da = a.delay;
        const db = b.delay;
        if (a.delayError && !b.delayError) return 1;
        if (!a.delayError && b.delayError) return -1;
        if (a.delayError && b.delayError) {
          return a.name.localeCompare(b.name, "zh-Hans-CN");
        }
        if (da === undefined && db === undefined) {
          return a.name.localeCompare(b.name, "zh-Hans-CN");
        }
        if (da === undefined) return 1;
        if (db === undefined) return -1;
        return da - db;
      });
    }
    return arr;
  }, [activeNodes, sortBy]);

  const displayList = useMemo(() => {
    if (!isTestingLatency || !frozenIds?.length) return sortedList;
    const byId = new Map(activeNodes.map((n) => [n.id, n]));
    return frozenIds
      .map((id) => byId.get(id))
      .filter((n): n is (typeof activeNodes)[number] => n != null);
  }, [isTestingLatency, frozenIds, activeNodes, sortedList]);

  const sortedListRef = useRef(sortedList);
  sortedListRef.current = sortedList;

  useLayoutEffect(() => {
    if (isTestingLatency && !wasTestingRef.current) {
      wasTestingRef.current = true;
      setFrozenIds(sortedListRef.current.map((n) => n.id));
      return;
    }
    if (!isTestingLatency && wasTestingRef.current) {
      wasTestingRef.current = false;
      setFrozenIds(null);
    }
  }, [isTestingLatency]);

  useEffect(() => {
    if (isDrawerOpen) {
      void refreshSubscriptionNodesFromDb();
    } else {
      wasTestingRef.current = false;
      setFrozenIds(null);
    }
  }, [isDrawerOpen, currentProvider?.id, refreshSubscriptionNodesFromDb]);

  const handlePickNode = (id: string) => {
    const node = displayList.find((n) => n.id === id);
    if (node) {
      void applyNodeSelection(node);
      setIsDrawerOpen(false);
    }
  };

  const isDesktop = layout === "desktop";
  const nodePickerPaddingBottom = isDesktop
    ? "1.25rem"
    : "calc(100px + env(safe-area-inset-bottom, 0px))";

  return (
    <div
      className={cn(
        "flex h-full min-h-0 w-full flex-col overflow-hidden",
        !isDesktop && "max-w-md mx-auto",
        isDesktop && "flex-1",
      )}
    >
      {/* Subscription card — 固定在上，避免与下方计时/球体重叠 */}
      <div className="relative z-30 shrink-0 px-4 pt-4 pb-1">
        {currentProvider ? (
          <div className="rounded-2xl border flex flex-col gap-3 px-4 py-3.5 bg-gradient-to-r from-white/35 via-white/20 to-white/10 dark:from-zinc-950/40 dark:via-zinc-900/30 dark:to-zinc-900/10 border-white/25 dark:border-white/[0.06] shadow-[0_10px_32px_rgba(59,130,246,0.04),inset_0_1px_1.5px_rgba(255,255,255,0.7)] dark:shadow-[0_12px_36px_rgba(0,0,0,0.45),inset_0_1px_1px_rgba(255,255,255,0.05)] backdrop-blur-xl [@media(max-height:700px)]:gap-2 [@media(max-height:700px)]:py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-500 shrink-0">
                  <Package className="w-4 h-4" />
                </div>
                <h4 className="text-[13px] font-bold text-foreground leading-tight truncate">
                  {currentProvider.name}
                </h4>
              </div>
              <button
                type="button"
                onClick={onOpenProviders}
                className="text-[10px] font-bold text-primary px-3 py-1.5 rounded-full bg-primary/10 hover:bg-primary/15 active:scale-95 transition-all shrink-0"
              >
                切换服务商
              </button>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                <span>
                  已用{" "}
                  <span className="text-foreground font-bold">
                    {currentProvider.trafficUsedGB?.toFixed(1) ?? "0"} GB
                  </span>
                </span>
                <span>
                  共{" "}
                  <span className="text-foreground font-bold">
                    {currentProvider.trafficTotalGB?.toFixed(1) ?? "0"} GB
                  </span>
                </span>
              </div>

              <div className="w-full h-1.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-indigo-500 shadow-[0_0_8px_rgba(59,130,246,0.5)] transition-all duration-500"
                  style={{
                    width: `${Math.min(100, ((currentProvider.trafficUsedGB ?? 0) / (currentProvider.trafficTotalGB ?? 1)) * 100)}%`,
                  }}
                />
              </div>

              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>
                  <span className="text-primary font-bold">
                    {(
                      ((currentProvider.trafficUsedGB ?? 0) /
                        (currentProvider.trafficTotalGB ?? 1)) *
                      100
                    ).toFixed(1)}
                    %
                  </span>{" "}
                  已使用
                </span>
                <span>
                  到期{" "}
                  <span className="text-foreground font-semibold">
                    {currentProvider.expiresAt
                      ? new Date(currentProvider.expiresAt).toLocaleDateString(
                          "zh-CN",
                          {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                          },
                        )
                      : "无限期"}
                  </span>
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border px-4 py-3.5 text-center bg-gradient-to-r from-white/35 via-white/20 to-white/10 dark:from-zinc-950/40 dark:via-zinc-900/30 dark:to-zinc-900/10 border-white/25 dark:border-white/[0.06] shadow-[0_10px_32px_rgba(59,130,246,0.04),inset_0_1px_1.5px_rgba(255,255,255,0.7)] dark:shadow-[0_12px_36px_rgba(0,0,0,0.45),inset_0_1px_1px_rgba(255,255,255,0.05)] backdrop-blur-xl [@media(max-height:700px)]:py-3">
            <p className="text-xs text-muted-foreground font-medium">
              未激活任何服务商订阅
            </p>
            <button
              type="button"
              onClick={onOpenProviders}
              className="mt-2 text-xs font-bold text-primary inline-flex items-center gap-1"
            >
              去添加服务商 <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* 计时 + 连接球 + 未连接时的开关：仅在订阅与底栏之间的剩余空间内排版 */}
      <div className="relative z-20 flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden"
          aria-hidden
        >
          <div
            className={cn(
              "rounded-full blur-3xl transition-all duration-1000 ease-in-out",
              isConnected && !isDisconnecting
                ? "h-[min(320px,62dvh,100vw)] w-[min(320px,100vw)] bg-gradient-to-r from-cyan-500/40 via-blue-500/40 to-indigo-500/40 animate-breathing-active"
                : "h-[min(280px,58dvh,100vw)] w-[min(280px,100vw)] bg-slate-400/20 dark:bg-slate-800/30 animate-breathing-idle",
            )}
          />
        </div>

        <div
          className={cn(
            "relative z-10 flex min-h-0 flex-1 flex-col items-center justify-start overflow-y-auto overflow-x-hidden px-2",
            "py-[clamp(0.375rem,min(2.5dvh,2.5vw),0.75rem)]",
            "[scrollbar-width:thin]",
          )}
        >
          {/* Scroll wrapper to enable vertical centering with safe overflow scrolling */}
          <div className="my-auto flex flex-col items-center w-full shrink-0">
          {/* 计时与连接球间距：桌面端计时嵌入球内，移动端保留上方间距 */}
          <div
            className={cn(
              "flex shrink-0 flex-col items-center",
              !isDesktop && "gap-y-[clamp(0.5rem,min(4dvh,6vw),1.5rem)]",
            )}
          >
            {!isDesktop && (
              <div className="flex shrink-0 flex-col items-center px-1">
                <span
                  className={cn(
                    "select-none font-extrabold tabular-nums tracking-tight leading-none transition-colors duration-500",
                    "text-[clamp(1.125rem,min(7vw,9dvh),1.875rem)]",
                    isConnected && !isDisconnecting
                      ? "text-foreground"
                      : "text-muted-foreground/20",
                  )}
                >
                  {isConnected && !isDisconnecting
                    ? formatDuration(elapsedSec)
                    : "00:00:00"}
                </span>
              </div>
            )}

        <button
          type="button"
          onClick={handleConnectionToggle}
          disabled={!isConnected && (busy || !canConnect)}
          className={cn(
            "relative z-10 flex shrink-0 cursor-pointer flex-col items-center justify-center !rounded-full transition-all duration-700 ease-in-out",
            isDesktop ? "h-[220px] w-[220px]" : "h-[min(190px,50vw,26dvh)] w-[min(190px,50vw,26dvh)]",
            "pointer-events-auto backdrop-blur-2xl border group select-none outline-none focus:outline-none focus-visible:outline-none",
            isConnected && !isDisconnecting
              ? "border-cyan-500/30 dark:border-cyan-400/35 bg-transparent shadow-[0_0_50px_rgba(6,182,212,0.25),0_0_100px_rgba(59,130,246,0.1)]"
              : "border-slate-200/40 dark:border-white/[0.08] bg-transparent shadow-[0_8px_32px_rgba(0,0,0,0.02)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.02)] hover:border-primary/45 dark:hover:border-primary/40 hover:shadow-[0_0_30px_rgba(59,130,246,0.12)] dark:hover:shadow-[0_0_30px_rgba(99,102,241,0.2)]",
            busy && "border-primary/20",
            !isConnected && "opacity-95 hover:opacity-100",
          )}
        >
          {busy && (
            <svg className="absolute inset-0 size-full animate-spin" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="46"
                fill="none"
                stroke={`url(#${spinGradientId})`}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray="200 80"
              />
              <defs>
                <linearGradient
                  id={spinGradientId}
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="100%"
                >
                  <stop offset="0%" stopColor="var(--color-primary)" />
                  <stop offset="100%" stopColor="transparent" />
                </linearGradient>
              </defs>
            </svg>
          )}

          <div
            className={cn(
              "flex h-[70%] w-[70%] flex-col items-center justify-center gap-2 !rounded-full transition-all duration-700 ease-in-out [@media(max-height:700px)]:gap-1.5",
              isConnected && !isDisconnecting
                ? "bg-gradient-to-tr from-indigo-600 via-blue-500 to-cyan-400 dark:from-indigo-600 dark:via-blue-500 dark:to-cyan-400 shadow-[inset_0_2px_4px_rgba(255,255,255,0.45),0_10px_25px_rgba(59,130,246,0.45)] text-white"
                : busy
                  ? "bg-gradient-to-tr from-indigo-600/70 via-blue-500/70 to-cyan-400/70 text-white/90"
                  : "bg-gradient-to-b from-white to-slate-50/95 dark:from-zinc-800/85 dark:to-zinc-900/95 shadow-[0_2px_8px_rgba(0,0,0,0.04),inset_0_2px_3px_rgba(255,255,255,1)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.1)] border border-slate-200/50 dark:border-zinc-700/35",
            )}
          >
            {/* 桌面端：计时嵌入球内，位于图标上方 */}
            {isDesktop && (
              <span
                className={cn(
                  "select-none font-extrabold tabular-nums tracking-tight leading-none",
                  "text-[clamp(0.875rem,min(3.5vw,4.5dvh),1.25rem)]",
                  isConnected && !isDisconnecting
                    ? "text-white/80"
                    : "text-muted-foreground/25",
                )}
              >
                {isConnected && !isDisconnecting
                  ? formatDuration(elapsedSec)
                  : "00:00:00"}
              </span>
            )}
            <Power
              className={cn(
                "h-11 w-11 transition-all duration-700 [@media(max-height:700px)]:h-9 [@media(max-height:700px)]:w-9",
                isConnected && !isDisconnecting
                  ? "scale-110 drop-shadow-[0_0_8px_rgba(255,255,255,0.7)] text-white"
                  : "text-slate-400 dark:text-zinc-500 group-hover:text-primary dark:group-hover:text-cyan-400 group-hover:scale-110",
              )}
              strokeWidth={2}
            />
            <span
              className={cn(
                "text-[13px] font-bold tracking-widest transition-colors duration-700 [@media(max-height:700px)]:text-[11px]",
                isConnected && !isDisconnecting
                  ? "text-white/95"
                  : "text-slate-500 dark:text-zinc-400 group-hover:text-primary dark:group-hover:text-cyan-400",
              )}
            >
              {isDisconnecting
                ? "断开中"
                : isConnecting
                  ? "连接中"
                  : isConnected
                    ? "已连接"
                    : "未连接"}
            </span>
          </div>

        </button>
          </div>

        {/* 开关行：分流与去广告 */}
        <div
          className={cn(
            "pointer-events-auto grid grid-cols-2 gap-3.5 w-full max-w-[340px] px-4",
            "mt-[clamp(0.5rem,min(3dvh,4vw),1.25rem)]",
            "[@media(max-height:700px)]:mt-[clamp(0.375rem,min(2.5dvh,3vw),0.875rem)]",
          )}
        >
          {/* 智能分流 */}
          <button
            type="button"
            onClick={() => void setSmartRoute(!smartRoute)}
            disabled={isConnected}
            className={cn(
              "flex flex-col justify-between gap-3 p-3.5 rounded-2xl border transition-all duration-300 w-full text-left relative overflow-hidden group select-none",
              isConnected
                ? "opacity-60 cursor-not-allowed bg-black/[0.01] dark:bg-white/[0.01] border-border/10"
                : smartRoute
                  ? "bg-gradient-to-br from-primary/8 via-indigo-500/4 to-transparent border-primary/35 shadow-[0_8px_20px_rgba(59,130,246,0.06),inset_0_1px_1px_rgba(255,255,255,0.7)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.05)] cursor-pointer active:scale-[0.96]"
                  : "bg-black/[0.01] dark:bg-white/[0.02] border-border/10 hover:border-border/30 hover:bg-black/[0.03] dark:hover:bg-white/[0.04] cursor-pointer active:scale-[0.96]"
            )}
          >
            {smartRoute && !isConnected && (
              <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.12)_0%,transparent_70%)] opacity-100 pointer-events-none" />
            )}

            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2.5">
                <div className={cn(
                  "w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-300 shrink-0",
                  smartRoute
                    ? "bg-gradient-to-tr from-primary to-indigo-500 text-white shadow-[0_2px_8px_rgba(59,130,246,0.3)]"
                    : "bg-black/5 dark:bg-white/5 text-muted-foreground group-hover:text-foreground"
                )}>
                  <Compass className="w-4 h-4" />
                </div>
                <span className="text-[12px] font-extrabold text-foreground tracking-wide">
                  智能分流
                </span>
              </div>
              {isConnected && (
                <Lock className="w-3.5 h-3.5 text-muted-foreground/45 shrink-0 animate-fade-in" />
              )}
            </div>

            <div className="flex items-center justify-between w-full mt-1">
              <span className={cn(
                "text-[10px] truncate max-w-[80px] font-bold transition-colors",
                isConnected
                  ? "text-muted-foreground/50"
                  : smartRoute 
                    ? "text-primary font-extrabold" 
                    : "text-muted-foreground/70"
              )}>
                {isConnected ? "已锁定配置" : smartRoute ? "绕过大陆" : "全部走代理"}
              </span>
              <div
                className={cn(
                  "relative w-8 h-4.5 rounded-full transition-colors duration-300 pointer-events-none shrink-0",
                  isConnected 
                    ? (smartRoute ? "bg-primary/50" : "bg-black/5 dark:bg-white/10")
                    : (smartRoute ? "bg-gradient-to-r from-primary to-indigo-500" : "bg-black/15 dark:bg-white/15"),
                )}
              >
                <div
                  className={cn(
                    "absolute top-[2px] left-[2px] w-3.5 h-3.5 rounded-full bg-white shadow-[0_1.5px_3px_rgba(0,0,0,0.2)] transition-transform duration-300",
                    smartRoute && "translate-x-3.5",
                  )}
                />
              </div>
            </div>
          </button>

          {/* 智能去广告 */}
          <button
            type="button"
            onClick={() => void setSmartAdBlock(!smartAdBlock)}
            disabled={isConnected}
            className={cn(
              "flex flex-col justify-between gap-3 p-3.5 rounded-2xl border transition-all duration-300 w-full text-left relative overflow-hidden group select-none",
              isConnected
                ? "opacity-60 cursor-not-allowed bg-black/[0.01] dark:bg-white/[0.01] border-border/10"
                : smartAdBlock
                  ? "bg-gradient-to-br from-primary/8 via-indigo-500/4 to-transparent border-primary/35 shadow-[0_8px_20px_rgba(59,130,246,0.06),inset_0_1px_1px_rgba(255,255,255,0.7)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.05)] cursor-pointer active:scale-[0.96]"
                  : "bg-black/[0.01] dark:bg-white/[0.02] border-border/10 hover:border-border/30 hover:bg-black/[0.03] dark:hover:bg-white/[0.04] cursor-pointer active:scale-[0.96]"
            )}
          >
            {smartAdBlock && !isConnected && (
              <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.12)_0%,transparent_70%)] opacity-100 pointer-events-none" />
            )}

            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2.5">
                <div className={cn(
                  "w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-300 shrink-0",
                  smartAdBlock
                    ? "bg-gradient-to-tr from-primary to-indigo-500 text-white shadow-[0_2px_8px_rgba(59,130,246,0.3)]"
                    : "bg-black/5 dark:bg-white/5 text-muted-foreground group-hover:text-foreground"
                )}>
                  <Shield className="w-4 h-4" />
                </div>
                <span className="text-[12px] font-extrabold text-foreground tracking-wide">
                  去广告
                </span>
              </div>
              {isConnected && (
                <Lock className="w-3.5 h-3.5 text-muted-foreground/45 shrink-0 animate-fade-in" />
              )}
            </div>

            <div className="flex items-center justify-between w-full mt-1">
              <span className={cn(
                "text-[10px] truncate max-w-[80px] font-bold transition-colors",
                isConnected
                  ? "text-muted-foreground/50"
                  : smartAdBlock 
                    ? "text-primary font-extrabold" 
                    : "text-muted-foreground/70"
              )}>
                {isConnected ? "已锁定配置" : smartAdBlock ? "广告拦截开" : "广告防护关"}
              </span>
              <div
                className={cn(
                  "relative w-8 h-4.5 rounded-full transition-colors duration-300 pointer-events-none shrink-0",
                  isConnected 
                    ? (smartAdBlock ? "bg-primary/50" : "bg-black/5 dark:bg-white/10")
                    : (smartAdBlock ? "bg-gradient-to-r from-primary to-indigo-500" : "bg-black/15 dark:bg-white/15"),
                )}
              >
                <div
                  className={cn(
                    "absolute top-[2px] left-[2px] w-3.5 h-3.5 rounded-full bg-white shadow-[0_1.5px_3px_rgba(0,0,0,0.2)] transition-transform duration-300",
                    smartAdBlock && "translate-x-3.5",
                  )}
                />
              </div>
            </div>
          </button>
        </div>
          </div>
        </div>
      </div>

      <div
        className="relative z-10 shrink-0 px-4 pt-1"
        style={{ paddingBottom: nodePickerPaddingBottom }}
      >
        <button
          type="button"
          onClick={() => setIsDrawerOpen(true)}
          className={cn(
            "flex w-full max-w-[340px] mx-auto items-center justify-between gap-3.5 px-4 py-3.5 rounded-2xl text-left transition-all duration-300 relative overflow-hidden select-none outline-none group border active:scale-[0.98]",
            "bg-gradient-to-r from-white/35 via-white/20 to-white/10 dark:from-zinc-950/40 dark:via-zinc-900/30 dark:to-zinc-900/10",
            "border-white/25 dark:border-white/[0.06] shadow-[0_10px_32px_rgba(59,130,246,0.05),inset_0_1px_1.5px_rgba(255,255,255,0.7)] dark:shadow-[0_12px_36px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.05)]",
            "hover:border-primary/30 dark:hover:border-primary/20 hover:shadow-[0_12px_40px_rgba(59,130,246,0.12)]"
          )}
        >
          {isConnected && (
            <div className="absolute inset-0 bg-gradient-to-r from-primary/[0.03] to-transparent opacity-100 pointer-events-none animate-fade-in" />
          )}

          <div className="flex items-center gap-3.5 min-w-0 flex-1">
            <div className={cn(
              "w-11 h-11 rounded-full flex items-center justify-center text-2xl shrink-0 transition-all duration-500 border",
              isConnected
                ? "bg-gradient-to-br from-primary/15 via-indigo-500/10 to-transparent border-primary/25 dark:border-primary/30 shadow-[0_2px_10px_rgba(59,130,246,0.15)]"
                : "bg-white/60 dark:bg-zinc-800/80 border-slate-200/50 dark:border-zinc-700/50 shadow-sm"
            )}>
              <span className="group-hover:scale-110 transition-transform duration-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                {nodeLine.flag}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <span className="block text-[13px] font-extrabold text-foreground leading-tight tracking-wide truncate">
                {nodeLine.primary}
              </span>
              <div className="flex items-center gap-1.5 mt-1">
                {isConnected ? (
                  <>
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span className="block text-[10px] text-muted-foreground/85 truncate font-bold font-mono">
                      {nodeLine.secondary || "已连接代理"}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="inline-flex rounded-full h-1.5 w-1.5 bg-slate-400 dark:bg-zinc-500"></span>
                    <span className="block text-[10px] text-muted-foreground/75 truncate font-medium">
                      {currentNode ? "待连接 · 点击切换" : "选择可用节点"}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {currentNode?.delay != null ? (
              <span
                className={cn(
                  "text-[10px] font-bold tabular-nums px-2.5 py-1 rounded-full border transition-all duration-300 flex items-center gap-1 shadow-sm",
                  currentNode.delay < 100
                    ? "bg-emerald-500/8 border-emerald-500/25 text-emerald-600 dark:bg-emerald-500/15 dark:border-emerald-500/30 dark:text-emerald-400"
                    : currentNode.delay < 200
                      ? "bg-amber-500/8 border-amber-500/25 text-amber-600 dark:bg-amber-500/15 dark:border-amber-500/30 dark:text-amber-400"
                      : "bg-rose-500/8 border-rose-500/25 text-rose-600 dark:bg-rose-500/15 dark:border-rose-500/30 dark:text-rose-400"
                )}
              >
                <span className="w-1 h-1 rounded-full bg-current animate-pulse" />
                {currentNode.delay} ms
              </span>
            ) : (
              <span className="text-[10px] font-bold text-muted-foreground/85 px-2.5 py-1 rounded-full bg-black/5 dark:bg-white/5 border border-border/15 hover:border-border/30 transition-colors">
                {isConnected ? "测试延迟" : "选择节点"}
              </span>
            )}
            <div className="w-6 h-6 rounded-full bg-black/[0.02] dark:bg-white/[0.04] flex items-center justify-center border border-transparent group-hover:border-white/10 dark:group-hover:border-white/5 group-hover:bg-black/5 dark:group-hover:bg-white/10 transition-all">
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </div>
        </button>
      </div>

      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300"
            onClick={() => setIsDrawerOpen(false)}
          />

          <div className="relative w-full max-w-md h-[70dvh] flex flex-col mobile-bottom-drawer rounded-t-[28px] animate-fade-in-up z-10 overflow-hidden">
            <div className="flex justify-center py-2 shrink-0">
              <div className="w-10 h-1 bg-muted-foreground/30 dark:bg-white/20 rounded-full" />
            </div>

            <div className="px-4 pb-3 border-b border-border/20 flex flex-col gap-2 shrink-0">
              <div className="flex justify-between items-center">
                <h3 className="text-base font-bold text-foreground">选择代理节点</h3>
                <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-md font-medium">
                  共 {activeNodes.length} 个节点
                </span>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void testLatency()}
                  disabled={isTestingLatency || activeNodes.length === 0}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl py-2 px-3 text-xs font-bold bg-primary/10 text-primary hover:bg-primary/15 transition-all disabled:opacity-50"
                >
                  {isTestingLatency ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Activity className="w-3.5 h-3.5" />
                  )}
                  <span>{isTestingLatency ? "测速中" : "一键测速"}</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setSortBy((s) => (s === "name" ? "delay" : "name"))
                  }
                  disabled={isTestingLatency || activeNodes.length === 0}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl py-2 px-3 text-xs font-bold bg-muted/45 text-muted-foreground hover:bg-muted/70 transition-all"
                >
                  {sortBy === "name" ? (
                    <>
                      <ArrowDownAZ className="w-3.5 h-3.5" />
                      <span>名称排序</span>
                    </>
                  ) : (
                    <>
                      <ArrowDown01 className="w-3.5 h-3.5" />
                      <span>延迟排序</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 [scrollbar-width:none]">
              {activeNodes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-xs text-muted-foreground">暂无可用节点</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1 max-w-[200px]">
                    请确认已成功导入服务商订阅，且已开启代理连接。
                  </p>
                </div>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {displayList.map((node) => {
                    const active = currentNode?.id === node.id;
                    const delayText = node.delayError
                      ? "超时"
                      : node.delay != null
                        ? `${node.delay}ms`
                        : null;
                    const rowPending = Boolean(latencyPendingByNodeId[node.id]);
                    const nLine = parseNodeLabels(node.name, node.server);

                    return (
                      <li key={node.id}>
                        <button
                          type="button"
                          onClick={() => handlePickNode(node.id)}
                          className={cn(
                            "w-full flex items-center justify-between gap-3 px-3.5 py-3 rounded-2xl text-left transition-all duration-300 border relative overflow-hidden group select-none active:scale-[0.98]",
                            active
                              ? "bg-gradient-to-r from-primary/12 to-indigo-500/8 border-primary/30 text-foreground shadow-[0_4px_12px_rgba(59,130,246,0.06),inset_0_1px_1px_rgba(255,255,255,0.6)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.2),inset_0_1px_1px_rgba(255,255,255,0.04)]"
                              : "bg-white/40 dark:bg-white/[0.03] border-white/10 dark:border-white/[0.04] text-foreground hover:bg-white/60 dark:hover:bg-white/[0.06] hover:border-white/20 dark:hover:border-white/[0.08]",
                          )}
                        >
                          {active && (
                            <div className="absolute inset-0 bg-gradient-to-r from-primary/[0.03] to-transparent opacity-100 pointer-events-none animate-fade-in" />
                          )}

                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="w-9 h-9 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] flex items-center justify-center text-xl shrink-0 border border-black/5 dark:border-white/5 shadow-sm">
                              <span className="group-hover:scale-110 transition-transform duration-300" aria-hidden>
                                {nLine.flag}
                              </span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-bold truncate leading-tight tracking-wide">
                                {nLine.primary}
                              </div>
                              <div className="text-[9px] text-muted-foreground/80 truncate leading-normal mt-0.5 font-mono">
                                {node.server
                                  ? `${node.server}:${node.port}`
                                  : node.type}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2.5 shrink-0">
                            {rowPending ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" />
                            ) : delayText ? (
                              <span
                                className={cn(
                                  "text-[10px] font-bold tabular-nums px-2 py-0.5 rounded-full border flex items-center gap-1 shrink-0 shadow-sm",
                                  node.delayError
                                    ? "bg-rose-500/8 border-rose-500/25 text-rose-600 dark:bg-rose-500/15 dark:border-rose-500/30 dark:text-rose-400"
                                    : node.delay !== undefined && node.delay < 100
                                      ? "bg-emerald-500/8 border-emerald-500/25 text-emerald-600 dark:bg-emerald-500/15 dark:border-emerald-500/30 dark:text-emerald-400"
                                      : node.delay !== undefined && node.delay < 200
                                        ? "bg-amber-500/8 border-amber-500/25 text-amber-600 dark:bg-amber-500/15 dark:border-amber-500/30 dark:text-amber-400"
                                        : "bg-rose-500/8 border-rose-500/25 text-rose-600 dark:bg-rose-500/15 dark:border-rose-500/30 dark:text-rose-400"
                                )}
                              >
                                <span className="w-1 h-1 rounded-full bg-current animate-pulse" />
                                {delayText}
                              </span>
                            ) : (
                              <span className="text-[9px] font-medium text-muted-foreground/60 px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/5 border border-border/10">
                                未测速
                              </span>
                            )}

                            <div
                              className={cn(
                                "w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-all duration-300",
                                active
                                  ? "border-primary bg-gradient-to-tr from-primary to-indigo-500 shadow-[0_2px_6px_rgba(59,130,246,0.35)]"
                                  : "border-black/20 dark:border-white/20 bg-black/[0.02] dark:bg-white/[0.02]",
                              )}
                            >
                              {active && (
                                <div className="w-1.5 h-1.5 rounded-full bg-white shadow-sm" />
                              )}
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
