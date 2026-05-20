import { useEffect, useState, useMemo, useRef, useLayoutEffect } from "react";
import {
  Power,
  Zap,
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

interface MobileDashboardProps {
  onOpenProviders?: () => void;
}

export function MobileDashboard({ onOpenProviders }: MobileDashboardProps) {
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

  const [nowTick, setNowTick] = useState(() => Date.now());
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [sortBy, setSortBy] = useState<"name" | "delay">("delay");
  const [frozenIds, setFrozenIds] = useState<string[] | null>(null);
  const wasTestingRef = useRef(false);

  // 1. Timer for duration
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
        logErrorDetail("MobileDashboard.disconnect", e);
        toast.error(userFacingMessage("disconnect"));
      }
      return;
    }
    if (!canConnect || isConnecting) return;
    try {
      await connect();
    } catch (e) {
      logErrorDetail("MobileDashboard.connect", e);
      toast.error(userFacingMessage("connect"));
    }
  };

  // Node filtering and sorting for Drawer
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

  return (
    <div className="flex flex-col gap-4 w-full max-w-md mx-auto py-4 h-full">

      {/* 0. Subscription Details Panel at the Top */}
      {currentProvider ? (
        <div className="liquid-glass-card px-4 py-3.5 flex flex-col gap-3 shrink-0">
          {/* Header row */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-500 shrink-0">
                <Package className="w-4 h-4" />
              </div>
              <h4 className="text-[13px] font-bold text-foreground leading-tight truncate">{currentProvider.name}</h4>
            </div>
            <button
              type="button"
              onClick={onOpenProviders}
              className="text-[10px] font-bold text-primary px-3 py-1.5 rounded-full bg-primary/10 hover:bg-primary/15 active:scale-95 transition-all shrink-0"
            >
              切换服务商
            </button>
          </div>

          {/* Traffic stats and progress bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
              <span>已用 <span className="text-foreground font-bold">{currentProvider.trafficUsedGB?.toFixed(1) ?? "0"} GB</span></span>
              <span>共 <span className="text-foreground font-bold">{currentProvider.trafficTotalGB?.toFixed(1) ?? "0"} GB</span></span>
            </div>

            {/* Progress bar */}
            <div className="w-full h-1.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-indigo-500 shadow-[0_0_8px_rgba(59,130,246,0.5)] transition-all duration-500"
                style={{
                  width: `${Math.min(100, ((currentProvider.trafficUsedGB ?? 0) / (currentProvider.trafficTotalGB ?? 1)) * 100)}%`
                }}
              />
            </div>

            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span><span className="text-primary font-bold">{(((currentProvider.trafficUsedGB ?? 0) / (currentProvider.trafficTotalGB ?? 1)) * 100).toFixed(1)}%</span> 已使用</span>
              <span>
                到期 <span className="text-foreground font-semibold">
                  {currentProvider.expiresAt
                    ? new Date(currentProvider.expiresAt).toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" })
                    : "无限期"}
                </span>
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="liquid-glass-card px-4 py-3.5 text-center shrink-0">
          <p className="text-xs text-muted-foreground font-medium">未激活任何服务商订阅</p>
          <button
            type="button"
            onClick={onOpenProviders}
            className="mt-2 text-xs font-bold text-primary inline-flex items-center gap-1"
          >
            去添加服务商 <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 2. Circular Liquid Glass Connection Dial — flex-1 fills remaining space */}
      <div className="relative flex-1 flex flex-col justify-center items-center gap-3">
        {/* Colorful Breathing Backlight Glow — centered via left-1/2 top-1/2 + keyframe translate(-50%,-50%) */}
        <div className={cn(
          "absolute left-1/2 top-1/2 rounded-full transition-all duration-1000 ease-in-out blur-3xl pointer-events-none",
          isConnected && !isDisconnecting
            ? "w-[320px] h-[320px] bg-primary/25 dark:bg-primary/20 animate-breathing-active"
            : "w-[280px] h-[280px] bg-primary/10 dark:bg-primary/5 animate-breathing-idle"
        )} />

        {/* Timer above button */}
        {isConnected && !isDisconnecting ? (
          <span className="text-3xl font-extrabold tracking-tight tabular-nums text-foreground z-10 select-none">
            {formatDuration(elapsedSec)}
          </span>
        ) : (
          <span className="text-3xl font-extrabold tracking-tight tabular-nums text-muted-foreground/20 z-10 select-none">
            00:00:00
          </span>
        )}

        {/* Main Orb Button — responsive: 230px cap, scales with viewport */}
        <button
          type="button"
          onClick={handleConnectionToggle}
          disabled={!isConnected && (busy || !canConnect)}
          className={cn(
            "relative w-[min(230px,58vw)] h-[min(230px,58vw)] !rounded-full flex flex-col items-center justify-center transition-all duration-700 ease-in-out cursor-pointer z-10",
            "liquid-glass-card shadow-lg ring-1 ring-white/20 select-none outline-none focus:outline-none focus-visible:outline-none",
            isConnected && !isDisconnecting
              ? "border-primary/45 shadow-[0_0_48px_rgba(59,130,246,0.38)]"
              : "border-white/20 hover:opacity-100",
            busy && "border-primary/20",
            !isConnected && "opacity-90"
          )}
        >
          {/* Connecting/Disconnecting Spin Rings */}
          {busy && (
            <svg className="absolute inset-0 size-full animate-spin" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="46"
                fill="none"
                stroke="url(#orb-spin-gradient)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray="200 80"
              />
              <defs>
                <linearGradient id="orb-spin-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="var(--color-primary)" />
                  <stop offset="100%" stopColor="transparent" />
                </linearGradient>
              </defs>
            </svg>
          )}

          {/* Inner Liquid Dial Content — 70% of outer orb */}
          <div className={cn(
            "w-[min(161px,40.6vw)] h-[min(161px,40.6vw)] !rounded-full flex flex-col items-center justify-center gap-2.5 shadow-inner transition-all duration-700 ease-in-out",
            isConnected && !isDisconnecting
              ? "bg-gradient-to-br from-primary to-blue-600 shadow-[inset_0_2px_4px_rgba(255,255,255,0.4)] text-white"
              : busy
                ? "bg-gradient-to-br from-primary/60 to-blue-500/60 text-white/90"
                : "bg-gradient-to-br from-muted/50 to-muted/20 dark:from-white/10 dark:to-white/5 text-muted-foreground"
          )}>
            <Power className={cn(
              "w-11 h-11 transition-transform duration-700",
              isConnected && !isDisconnecting ? "scale-110 drop-shadow-[0_0_8px_rgba(255,255,255,0.6)]" : ""
            )} strokeWidth={2} />
            <span className="text-[13px] font-bold uppercase tracking-widest">
              {isDisconnecting ? "关闭中" : isConnecting ? "连接中" : isConnected ? "已开启" : "未连接"}
            </span>
          </div>

          {/* Outer ripples when active */}
          {isConnected && !isDisconnecting && (
            <>
              <div className="absolute inset-0 rounded-full border-2 border-primary/20 animate-ping" style={{ animationDuration: "2s" }} />
              <div className="absolute inset-[-16px] rounded-full border border-primary/10 animate-ping" style={{ animationDuration: "4s", animationDelay: "0.5s" }} />
            </>
          )}
        </button>
      </div>

      {/* 5. Node Picker — only when connected */}
      {isConnected && (
        <div className="liquid-glass-card px-2 py-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            className="flex w-full items-center justify-between gap-3 px-3 py-3 rounded-2xl bg-transparent active:bg-black/5 dark:active:bg-white/5 transition-all text-left"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <span className="text-xl leading-none shrink-0" aria-hidden>{nodeLine.flag}</span>
              <div className="min-w-0 flex-1">
                <span className="block text-[13px] font-bold text-foreground leading-tight truncate">{nodeLine.primary}</span>
                {nodeLine.secondary && (
                  <span className="block text-[10px] text-muted-foreground truncate leading-normal mt-0.5">{nodeLine.secondary}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {currentNode?.delay != null ? (
                <span className={cn("text-xs font-bold tabular-nums", getLatencyColor(currentNode.delay))}>
                  {currentNode.delay} ms
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">测试延迟</span>
              )}
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
          </button>
        </div>
      )}

      {/* --- iOS Style Bottom Sheet Node Drawer --- */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          {/* Backdrop Mask */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300"
            onClick={() => setIsDrawerOpen(false)}
          />

          {/* Bottom Drawer Sheet */}
          <div className="relative w-full max-w-md h-[70dvh] flex flex-col mobile-bottom-drawer rounded-t-[28px] animate-fade-in-up z-10 overflow-hidden">
            {/* iOS top drag handler handle */}
            <div className="flex justify-center py-2 shrink-0">
              <div className="w-10 h-1 bg-muted-foreground/30 dark:bg-white/20 rounded-full" />
            </div>

            {/* Header controls inside Drawer */}
            <div className="px-4 pb-3 border-b border-border/20 flex flex-col gap-2 shrink-0">
              <div className="flex justify-between items-center">
                <h3 className="text-base font-bold text-foreground">选择代理节点</h3>
                <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-md font-medium">
                  共 {activeNodes.length} 个节点
                </span>
              </div>

              {/* Sorting and testing controls */}
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
                  onClick={() => setSortBy((s) => (s === "name" ? "delay" : "name"))}
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

            {/* Scrollable Node List */}
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
                              : "bg-black/5 dark:bg-white/5 border border-transparent text-foreground hover:bg-black/10 dark:hover:bg-white/10"
                          )}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <span className="text-2xl leading-none shrink-0" aria-hidden>
                              {nLine.flag}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-bold truncate leading-tight">{nLine.primary}</div>
                              <div className="text-[9px] text-muted-foreground truncate leading-normal mt-0.5">
                                {node.server ? `${node.server}:${node.port}` : node.type}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {rowPending ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                            ) : delayText ? (
                              <span className={cn("text-[10px] font-bold tabular-nums", node.delayError ? "text-red-500" : getLatencyColor(node.delay))}>
                                {delayText}
                              </span>
                            ) : (
                              <span className="text-[9px] text-muted-foreground/60">未测速</span>
                            )}

                            <div className={cn(
                              "w-4 h-4 rounded-full border flex items-center justify-center shrink-0",
                              active ? "border-primary bg-primary" : "border-muted-foreground/30"
                            )}>
                              {active && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
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
