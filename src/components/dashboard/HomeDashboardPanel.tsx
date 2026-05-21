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
} from "lucide-react";
import { useProxyStore, useAppStore } from "@/stores/appStore";
import { cn } from "@/lib/utils";
import { getLatencyColor } from "@/types";
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

  const { proxyMode, setProxyMode } = useAppStore();
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [sortBy, setSortBy] = useState<"name" | "delay">("delay");
  const [frozenIds, setFrozenIds] = useState<string[] | null>(null);
  const [smartRoute, setSmartRoute] = useState(true);
  const [smartAdBlock, setSmartAdBlock] = useState(false);
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
          <div className="glass rounded-2xl bg-gradient-to-br from-primary/10 via-indigo-500/8 to-transparent dark:from-primary/15 dark:via-indigo-500/10 dark:to-transparent flex flex-col gap-3 px-4 py-3.5 [@media(max-height:700px)]:gap-2 [@media(max-height:700px)]:py-3">
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
          <div className="glass rounded-2xl bg-gradient-to-br from-primary/10 via-indigo-500/8 to-transparent dark:from-primary/15 dark:via-indigo-500/10 dark:to-transparent px-4 py-3.5 text-center [@media(max-height:700px)]:py-3">
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
            "relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto overflow-x-hidden px-2",
            "py-[clamp(0.375rem,min(2.5dvh,2.5vw),0.75rem)]",
            "[scrollbar-width:thin]",
          )}
        >
          {/* 计时与连接球间距：桌面端计时嵌入球内，移动端保留上方间距 */}
          <div
            className={cn(
              "flex shrink-0 flex-col items-center",
              !isDesktop && "gap-y-[clamp(0.5rem,min(4dvh,6vw),1.5rem)]",
            )}
          >
            {/* 移动端：计时在球上方 */}
            {!isDesktop && (
              <div className="flex shrink-0 justify-center px-1">
                {isConnected && !isDisconnecting ? (
                  <span
                    className={cn(
                      "select-none font-extrabold tabular-nums tracking-tight text-foreground",
                      "text-[clamp(1.125rem,min(7vw,9dvh),1.875rem)] leading-none",
                    )}
                  >
                    {formatDuration(elapsedSec)}
                  </span>
                ) : (
                  <span
                    className={cn(
                      "select-none font-extrabold tabular-nums tracking-tight text-muted-foreground/20",
                      "text-[clamp(1.125rem,min(7vw,9dvh),1.875rem)] leading-none",
                    )}
                  >
                    00:00:00
                  </span>
                )}
              </div>
            )}

        <button
          type="button"
          onClick={handleConnectionToggle}
          disabled={!isConnected && (busy || !canConnect)}
          className={cn(
            "relative z-10 flex shrink-0 cursor-pointer flex-col items-center justify-center !rounded-full transition-all duration-700 ease-in-out",
            "h-[min(230px,58vw,38dvh)] w-[min(230px,58vw,38dvh)]",
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
              "flex h-[min(161px,40.6vw,26.5dvh)] w-[min(161px,40.6vw,26.5dvh)] flex-col items-center justify-center gap-2 !rounded-full transition-all duration-700 ease-in-out [@media(max-height:700px)]:gap-1.5",
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

        {/* 开关行：移动未连接→分流+去广告；PC 未连接→三者一排；PC 已连接→仅全局模式 */}
        {(!isConnected || isDesktop) && (
          <div
            className={cn(
              "pointer-events-auto flex shrink-0 flex-row flex-wrap items-start justify-center gap-x-8 gap-y-2 px-2",
              "mt-[clamp(0.5rem,min(3dvh,4vw),1.25rem)] max-[380px]:gap-x-5",
              "[@media(max-height:700px)]:mt-[clamp(0.375rem,min(2.5dvh,3vw),0.875rem)] [@media(max-height:700px)]:gap-x-6",
              isDesktop && "lg:gap-x-12 xl:gap-x-14",
            )}
          >
            {!isConnected ? (
              <>
                <button
                  type="button"
                  onClick={() => setSmartRoute((v) => !v)}
                  className="flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-2xl select-none text-muted-foreground [@media(max-height:700px)]:gap-1 [@media(max-height:700px)]:py-2"
                >
                  <span className="text-[11px] font-semibold whitespace-nowrap">
                    智能分流
                  </span>
                  <div
                    className={cn(
                      "relative w-10 h-[22px] rounded-full transition-colors duration-300 shrink-0",
                      smartRoute ? "bg-primary" : "bg-black/15 dark:bg-white/15",
                    )}
                  >
                    <div
                      className={cn(
                        "absolute top-[2px] left-[2px] w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-transform duration-300",
                        smartRoute && "translate-x-[18px]",
                      )}
                    />
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setSmartAdBlock((v) => !v)}
                  className="flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-2xl select-none text-muted-foreground [@media(max-height:700px)]:gap-1 [@media(max-height:700px)]:py-2"
                >
                  <span className="text-[11px] font-semibold whitespace-nowrap">
                    智能去广告
                  </span>
                  <div
                    className={cn(
                      "relative w-10 h-[22px] rounded-full transition-colors duration-300 shrink-0",
                      smartAdBlock ? "bg-primary" : "bg-black/15 dark:bg-white/15",
                    )}
                  >
                    <div
                      className={cn(
                        "absolute top-[2px] left-[2px] w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-transform duration-300",
                        smartAdBlock && "translate-x-[18px]",
                      )}
                    />
                  </div>
                </button>
              </>
            ) : null}

            {isDesktop ? (
              <button
                type="button"
                onClick={() =>
                  void setProxyMode(proxyMode === "global" ? "rule" : "global")
                }
                className={cn(
                  "flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-2xl select-none [@media(max-height:700px)]:gap-1 [@media(max-height:700px)]:py-2",
                  proxyMode === "global"
                    ? "text-primary"
                    : "text-muted-foreground",
                )}
                aria-pressed={proxyMode === "global"}
              >
                <span className="text-[11px] font-semibold whitespace-nowrap">
                  全局模式
                </span>
                <div
                  className={cn(
                    "relative h-[22px] w-10 shrink-0 rounded-full transition-colors duration-300",
                    proxyMode === "global"
                      ? "bg-primary"
                      : "bg-black/15 dark:bg-white/15",
                  )}
                >
                  <div
                    className={cn(
                      "absolute left-[2px] top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform duration-300",
                      proxyMode === "global" && "translate-x-[18px]",
                    )}
                  />
                </div>
              </button>
            ) : null}
          </div>
        )}
        </div>
      </div>

      {isConnected && (
        <div
          className="relative z-10 shrink-0 px-4 pt-1"
          style={{ paddingBottom: nodePickerPaddingBottom }}
        >
          <div className="liquid-glass-card px-2 py-2 max-w-[280px] mx-auto">
            <button
              type="button"
              onClick={() => setIsDrawerOpen(true)}
              className="flex w-full items-center justify-between gap-3 px-3 py-3 rounded-2xl bg-transparent active:bg-black/5 dark:active:bg-white/5 transition-all text-left"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className="text-xl leading-none shrink-0" aria-hidden>
                  {nodeLine.flag}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="block text-[13px] font-bold text-foreground leading-tight truncate">
                    {nodeLine.primary}
                  </span>
                  {nodeLine.secondary && (
                    <span className="block text-[10px] text-muted-foreground truncate leading-normal mt-0.5">
                      {nodeLine.secondary}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {currentNode?.delay != null ? (
                  <span
                    className={cn(
                      "text-xs font-bold tabular-nums",
                      getLatencyColor(currentNode.delay),
                    )}
                  >
                    {currentNode.delay} ms
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">测试延迟</span>
                )}
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </button>
          </div>
        </div>
      )}

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
                            "w-full flex items-center justify-between gap-3 px-3.5 py-3 rounded-2xl text-left transition-all",
                            active
                              ? "bg-primary/10 text-primary border border-primary/20"
                              : "bg-black/5 dark:bg-white/5 border border-transparent text-foreground hover:bg-black/10 dark:hover:bg-white/10",
                          )}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <span
                              className="text-2xl leading-none shrink-0"
                              aria-hidden
                            >
                              {nLine.flag}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-bold truncate leading-tight">
                                {nLine.primary}
                              </div>
                              <div className="text-[9px] text-muted-foreground truncate leading-normal mt-0.5">
                                {node.server
                                  ? `${node.server}:${node.port}`
                                  : node.type}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {rowPending ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                            ) : delayText ? (
                              <span
                                className={cn(
                                  "text-[10px] font-bold tabular-nums",
                                  node.delayError
                                    ? "text-red-500"
                                    : getLatencyColor(node.delay),
                                )}
                              >
                                {delayText}
                              </span>
                            ) : (
                              <span className="text-[9px] text-muted-foreground/60">
                                未测速
                              </span>
                            )}

                            <div
                              className={cn(
                                "w-4 h-4 rounded-full border flex items-center justify-center shrink-0",
                                active
                                  ? "border-primary bg-primary"
                                  : "border-muted-foreground/30",
                              )}
                            >
                              {active && (
                                <div className="w-1.5 h-1.5 rounded-full bg-white" />
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
