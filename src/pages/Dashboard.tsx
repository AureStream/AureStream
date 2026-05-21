import { useEffect, useLayoutEffect, useState, useMemo, useRef, useId } from "react";
import { NetworkBlock } from "@/components/dashboard/NetworkBlock";
import { UsageBlock } from "@/components/dashboard/UsageBlock";
import { PageShell } from "@/components/layout/PageShell";
import { cn } from "@/lib/utils";
import { useProxyStore, useAppStore } from "@/stores/appStore";
import { getLatencyColor } from "@/types";
import type { Node } from "@/types";
import { toast } from "sonner";
import { logErrorDetail, userFacingMessage } from "@/lib/userErrors";
import {
  Power,
  Loader2,
  RefreshCw,
  Activity,
  ArrowDown01,
  ArrowDownAZ,
  Package,
  ChevronRight,
  Compass,
  Shield,
} from "lucide-react";

const SERIES_LEN = 48;

function emptySeries(): number[] {
  return Array.from({ length: SERIES_LEN }, () => 0);
}

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

export function Dashboard({
  onOpenProviders,
}: {
  onOpenProviders?: () => void;
}) {
  const spinGradientId = useId().replace(/:/g, "");

  const {
    currentProvider,
    currentNode,
    isConnected,
    isConnecting,
    isDisconnecting,
    connectedAt,
    uploadSpeed,
    downloadSpeed,
    sessionUploadBytes,
    sessionDownloadBytes,
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

  const [uploadSeries, setUploadSeries] = useState(emptySeries);
  const [downloadSeries, setDownloadSeries] = useState(emptySeries);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [sortBy, setSortBy] = useState<"name" | "delay">("delay");
  const [frozenIds, setFrozenIds] = useState<string[] | null>(null);
  const wasTestingRef = useRef(false);

  // 1. 本次会话流量数据转换
  const sessionUploadGb = isConnected ? sessionUploadBytes / 1024 ** 3 : undefined;
  const sessionDownloadGb = isConnected ? sessionDownloadBytes / 1024 ** 3 : undefined;

  // 2. 统计图数据收集
  useLayoutEffect(() => {
    setUploadSeries(emptySeries());
    setDownloadSeries(emptySeries());
  }, [isConnected]);

  useEffect(() => {
    if (!isConnected) return;
    setUploadSeries((prev) => [...prev.slice(1), uploadSpeed]);
    setDownloadSeries((prev) => [...prev.slice(1), downloadSpeed]);
  }, [isConnected, uploadSpeed, downloadSpeed]);

  useEffect(() => {
    if (isConnected) return;
    const id = window.setInterval(() => {
      const t = Date.now() / 4500;
      const base = (Math.sin(t) * 0.5 + 0.5) * 4096;
      setUploadSeries((prev) => [...prev.slice(1), base * 0.35]);
      setDownloadSeries((prev) => [...prev.slice(1), base * 0.52]);
    }, 2200);
    return () => clearInterval(id);
  }, [isConnected]);

  // 3. 在线时长计算
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsedSec =
    isConnected && connectedAt
      ? Math.max(0, Math.floor((nowTick - connectedAt) / 1000))
      : 0;

  // 4. 节点列表过滤与排序
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

  // 定时刷新节点信息
  useEffect(() => {
    void refreshSubscriptionNodesFromDb();
  }, [currentProvider?.id, refreshSubscriptionNodesFromDb]);

  const handlePickNode = (node: Node) => {
    void applyNodeSelection(node);
  };

  const handleConnectionToggle = async () => {
    if (isConnected) {
      if (busy) return;
      try {
        await disconnect();
      } catch (e) {
        logErrorDetail("Dashboard.disconnect", e);
        toast.error(userFacingMessage("disconnect"));
      }
      return;
    }
    if (!canConnect || isConnecting) return;
    try {
      await connect();
    } catch (e) {
      logErrorDetail("Dashboard.connect", e);
      toast.error(userFacingMessage("connect"));
    }
  };

  const canConnect = Boolean(currentProvider);
  const busy = isConnecting || isDisconnecting;



  return (
    <PageShell fillHeight className="max-w-7xl" title="首页">
      <div className="relative flex w-full flex-1 min-h-0 overflow-hidden">
        {/* 中轴光晕背景 */}
        <div
          className={cn(
            "pointer-events-none absolute inset-0 transition-opacity duration-1000",
            isConnected ? "opacity-100" : "opacity-60",
          )}
          aria-hidden
          style={{
            background:
              "radial-gradient(ellipse 50% 70% at 50% 50%, color-mix(in srgb, var(--color-primary) 8%, transparent) 0%, transparent 70%)",
          }}
        />

        {/* 双栏黄金比例布局 */}
        <div className="relative flex flex-col md:flex-row w-full h-full gap-4 lg:gap-6 min-h-0 z-10">
          
          {/* 左侧主功能区：控制卡片 + 节点面板 */}
          <div className="flex-1 flex flex-col gap-5 min-h-0 overflow-hidden">
            
            {/* 卡片 A：连接与控制面板 */}
            <div className="glass rounded-3xl p-5 flex items-center gap-6 shrink-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent">
              {/* 左侧：连接圆球 */}
              <div className="relative flex shrink-0 items-center justify-center">
                <button
                  type="button"
                  onClick={handleConnectionToggle}
                  disabled={!isConnected && (busy || !canConnect)}
                  className={cn(
                    "relative z-10 flex shrink-0 cursor-pointer flex-col items-center justify-center !rounded-full transition-all duration-700 ease-in-out",
                    "h-[126px] w-[126px]",
                    "pointer-events-auto backdrop-blur-2xl border group select-none outline-none focus:outline-none focus-visible:outline-none",
                    isConnected && !isDisconnecting
                      ? "border-cyan-500/30 dark:border-cyan-400/35 bg-transparent shadow-[0_0_40px_rgba(6,182,212,0.2),0_0_80px_rgba(59,130,246,0.08)]"
                      : "border-slate-200/40 dark:border-white/[0.08] bg-transparent shadow-[0_8px_24px_rgba(0,0,0,0.02)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.2),inset_0_1px_1px_rgba(255,255,255,0.02)] hover:border-primary/45 dark:hover:border-primary/40 hover:shadow-[0_0_24px_rgba(59,130,246,0.08)] dark:hover:shadow-[0_0_24px_rgba(99,102,241,0.15)]",
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
                      "flex h-[88px] w-[88px] flex-col items-center justify-center gap-1.5 !rounded-full transition-all duration-700 ease-in-out",
                      isConnected && !isDisconnecting
                        ? "bg-gradient-to-tr from-indigo-600 via-blue-500 to-cyan-400 dark:from-indigo-600 dark:via-blue-500 dark:to-cyan-400 shadow-[inset_0_2px_4px_rgba(255,255,255,0.45),0_8px_16px_rgba(59,130,246,0.35)] text-white"
                        : busy
                          ? "bg-gradient-to-tr from-indigo-600/70 via-blue-500/70 to-cyan-400/70 text-white/90"
                          : "bg-gradient-to-b from-white to-slate-50/95 dark:from-zinc-800/85 dark:to-zinc-900/95 shadow-[0_2px_6px_rgba(0,0,0,0.04),inset_0_2px_3px_rgba(255,255,255,1)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.25),inset_0_1px_1px_rgba(255,255,255,0.1)] border border-slate-200/50 dark:border-zinc-700/35",
                    )}
                  >
                    <Power
                      className={cn(
                        "h-7 w-7 transition-all duration-700",
                        isConnected && !isDisconnecting
                          ? "scale-110 drop-shadow-[0_0_6px_rgba(255,255,255,0.6)] text-white"
                          : "text-slate-400 dark:text-zinc-500 group-hover:text-primary dark:group-hover:text-cyan-400 group-hover:scale-110",
                      )}
                      strokeWidth={2.5}
                    />
                    <span
                      className={cn(
                        "text-[10px] font-bold tracking-widest transition-colors duration-700",
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

              {/* 右侧：状态展示与智能控制卡片 */}
              <div className="flex-1 flex flex-col justify-between self-stretch min-w-0 py-0.5 gap-4">
                {/* 状态与时长双栏布局 */}
                <div className="flex items-center justify-between border-b border-border/10 pb-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold tracking-wider text-muted-foreground/80 uppercase">
                      服务状态
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "size-2 rounded-full",
                          isConnected && !isDisconnecting
                            ? "bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]"
                            : isConnecting
                              ? "bg-amber-500 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.6)]"
                              : "bg-zinc-400",
                        )}
                      />
                      <span className="text-xs font-bold text-foreground leading-none">
                        {isDisconnecting
                          ? "正在断开网络连接..."
                          : isConnecting
                            ? "建立安全代理中..."
                            : isConnected
                              ? "安全代理网络已建立"
                              : "安全代理已断开"}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <span className="text-[10px] font-bold tracking-wider text-muted-foreground/80 uppercase">
                      已连接时长
                    </span>
                    <div className={cn(
                      "text-lg font-black font-mono tracking-wider leading-none",
                      isConnected && !isDisconnecting
                        ? "text-emerald-500 dark:text-emerald-400 drop-shadow-[0_0_6px_rgba(16,185,129,0.25)]"
                        : "text-muted-foreground/50"
                    )}>
                      {isConnected ? formatDuration(elapsedSec) : "00:00:00"}
                    </div>
                  </div>
                </div>

                {/* 智能开关卡片组 */}
                <div className="grid grid-cols-2 gap-3.5">
                  {/* 智能分流 */}
                  <button
                    type="button"
                    onClick={() => void setSmartRoute(!smartRoute)}
                    className={cn(
                      "flex items-center justify-between gap-3 p-2.5 rounded-2xl border transition-all duration-300 cursor-pointer select-none text-left relative overflow-hidden group active:scale-[0.98]",
                      smartRoute
                        ? "bg-primary/8 border-primary/20 hover:bg-primary/12"
                        : "bg-black/[0.01] dark:bg-white/[0.01] border-border/40 hover:border-border/60 hover:bg-black/[0.03] dark:hover:bg-white/[0.02]"
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={cn(
                        "w-8 h-8 rounded-xl flex items-center justify-center transition-colors shrink-0",
                        smartRoute
                          ? "bg-primary/15 text-primary"
                          : "bg-muted/10 text-muted-foreground group-hover:text-foreground"
                      )}>
                        <Compass className="w-4.5 h-4.5" />
                      </div>
                      <div className="min-w-0">
                        <div className={cn("text-xs font-bold transition-colors leading-none", smartRoute ? "text-primary" : "text-foreground")}>
                          智能分流
                        </div>
                        <div className="text-[9px] text-muted-foreground/75 truncate mt-1">
                          {smartRoute ? "绕过局域网及大陆" : "全部流量走代理"}
                        </div>
                      </div>
                    </div>
                    <div
                      className={cn(
                        "relative w-7 h-4 rounded-full transition-colors duration-300 pointer-events-none shrink-0",
                        smartRoute ? "bg-primary" : "bg-black/15 dark:bg-white/15",
                      )}
                    >
                      <div
                        className={cn(
                          "absolute top-[2px] left-[2px] w-3 h-3 rounded-full bg-white shadow-sm transition-transform duration-300",
                          smartRoute && "translate-x-3",
                        )}
                      />
                    </div>
                  </button>

                  {/* 去广告 */}
                  <button
                    type="button"
                    onClick={() => void setSmartAdBlock(!smartAdBlock)}
                    className={cn(
                      "flex items-center justify-between gap-3 p-2.5 rounded-2xl border transition-all duration-300 cursor-pointer select-none text-left relative overflow-hidden group active:scale-[0.98]",
                      smartAdBlock
                        ? "bg-primary/8 border-primary/20 hover:bg-primary/12"
                        : "bg-black/[0.01] dark:bg-white/[0.01] border-border/40 hover:border-border/60 hover:bg-black/[0.03] dark:hover:bg-white/[0.02]"
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={cn(
                        "w-8 h-8 rounded-xl flex items-center justify-center transition-colors shrink-0",
                        smartAdBlock
                          ? "bg-primary/15 text-primary"
                          : "bg-muted/10 text-muted-foreground group-hover:text-foreground"
                      )}>
                        <Shield className="w-4.5 h-4.5" />
                      </div>
                      <div className="min-w-0">
                        <div className={cn("text-xs font-bold transition-colors leading-none", smartAdBlock ? "text-primary" : "text-foreground")}>
                          去广告
                        </div>
                        <div className="text-[9px] text-muted-foreground/75 truncate mt-1">
                          {smartAdBlock ? "已开启广告拦截" : "未开启广告防御"}
                        </div>
                      </div>
                    </div>
                    <div
                      className={cn(
                        "relative w-7 h-4 rounded-full transition-colors duration-300 pointer-events-none shrink-0",
                        smartAdBlock ? "bg-primary" : "bg-black/15 dark:bg-white/15",
                      )}
                    >
                      <div
                        className={cn(
                          "absolute top-[2px] left-[2px] w-3 h-3 rounded-full bg-white shadow-sm transition-transform duration-300",
                          smartAdBlock && "translate-x-3",
                        )}
                      />
                    </div>
                  </button>
                </div>
              </div>
            </div>

            {/* 卡片 B：一体化节点面板 */}
            <div className="glass rounded-3xl p-5 flex flex-col flex-1 min-h-0">
              <div className="flex justify-between items-center pb-3.5 border-b border-border/10 shrink-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-foreground">选择代理节点</h3>
                  <span className="text-[10px] text-muted-foreground bg-black/5 dark:bg-white/5 px-2 py-0.5 rounded-md font-medium">
                    共 {activeNodes.length} 个节点
                  </span>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void testLatency()}
                    disabled={isTestingLatency || activeNodes.length === 0}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg py-1.5 px-3 text-[11px] font-bold bg-primary/10 text-primary hover:bg-primary/15 transition-all disabled:opacity-50"
                  >
                    {isTestingLatency ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Activity className="w-3 h-3" />
                    )}
                    <span>{isTestingLatency ? "测速中" : "一键测速"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSortBy((s) => (s === "name" ? "delay" : "name"))}
                    disabled={isTestingLatency || activeNodes.length === 0}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg py-1.5 px-3 text-[11px] font-bold bg-black/5 dark:bg-white/5 text-muted-foreground hover:bg-black/10 dark:hover:bg-white/10 transition-all"
                  >
                    {sortBy === "name" ? (
                      <>
                        <ArrowDownAZ className="w-3 h-3" />
                        <span>名称排序</span>
                      </>
                    ) : (
                      <>
                        <ArrowDown01 className="w-3 h-3" />
                        <span>延迟排序</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* 节点双列网格滚动容器 */}
              <div className="flex-1 min-h-0 overflow-y-auto pt-3.5 pr-1 [scrollbar-width:thin] text-foreground">
                {activeNodes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center h-full">
                    <Package className="w-8 h-8 text-muted-foreground/30 mb-2" />
                    <p className="text-xs text-muted-foreground">暂无可用节点</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1 max-w-[220px]">
                      请确认已成功选择服务商并导入订阅，且已开启代理连接。
                    </p>
                  </div>
                ) : (
                  <ul className="grid grid-cols-1 xl:grid-cols-2 gap-2">
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
                            onClick={() => handlePickNode(node)}
                            className={cn(
                              "w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left transition-all border",
                              active
                                ? "bg-primary/10 text-primary border-primary/20"
                                : "bg-black/[0.02] dark:bg-white/[0.02] border-transparent text-foreground hover:bg-black/5 dark:hover:bg-white/5",
                            )}
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <span className="text-xl leading-none shrink-0" aria-hidden>
                                {nLine.flag}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-semibold truncate leading-tight">
                                  {nLine.primary}
                                </div>
                                <div className="text-[9px] text-muted-foreground truncate leading-normal mt-0.5">
                                  {node.server ? `${node.server}:${node.port}` : node.type}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {rowPending ? (
                                <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground" />
                              ) : delayText ? (
                                <span
                                  className={cn(
                                    "text-[10px] font-bold tabular-nums",
                                    node.delayError ? "text-red-500" : getLatencyColor(node.delay),
                                  )}
                                >
                                  {delayText}
                                </span>
                              ) : (
                                <span className="text-[9px] text-muted-foreground/50">未测速</span>
                              )}

                              <div
                                className={cn(
                                  "size-3.5 rounded-full border flex items-center justify-center shrink-0",
                                  active ? "border-primary bg-primary" : "border-muted-foreground/30",
                                )}
                              >
                                {active && <div className="w-1 h-1 rounded-full bg-white" />}
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

          {/* 右侧：用量/网络/图表监控栏 */}
          <div className="w-full md:w-[300px] lg:w-[340px] shrink-0 flex flex-col gap-4 min-h-0 overflow-y-auto pr-2">
            
            {/* 卡片 C：订阅用量面板 */}
            <div className="glass rounded-3xl p-4 flex flex-col gap-3 bg-gradient-to-br from-primary/5 via-transparent to-transparent">
              {currentProvider ? (
                <>
                  <div className="flex items-center justify-between gap-3 pb-1 border-b border-border/10">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-500 shrink-0">
                        <Package className="w-4 h-4" />
                      </div>
                      <h4 className="text-xs font-bold text-foreground leading-tight truncate">
                        {currentProvider.name}
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={onOpenProviders}
                      className="text-[10px] font-bold text-primary px-3 py-1.5 rounded-full bg-primary/10 hover:bg-primary/15 active:scale-95 transition-all shrink-0"
                    >
                      管理服务商
                    </button>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                      <span>
                        已用 <span className="text-foreground font-bold">{currentProvider.trafficUsedGB?.toFixed(1) ?? "0"} GB</span>
                      </span>
                      <span>
                        共 <span className="text-foreground font-bold">{currentProvider.trafficTotalGB?.toFixed(1) ?? "0"} GB</span>
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
                          {(((currentProvider.trafficUsedGB ?? 0) / (currentProvider.trafficTotalGB ?? 1)) * 100).toFixed(1)}%
                        </span> 已使用
                      </span>
                      <span>
                        到期 <span className="text-foreground font-semibold">
                          {currentProvider.expiresAt
                            ? new Date(currentProvider.expiresAt).toLocaleDateString("zh-CN", {
                                year: "numeric",
                                month: "2-digit",
                                day: "2-digit",
                              })
                            : "无限期"}
                        </span>
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-4 flex flex-col items-center">
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
            </div>

            {/* 卡片 D：网络诊断面板 */}
            <div className="glass rounded-3xl p-4">
              <NetworkBlock />
            </div>

            {/* 卡片 E：实时速率折线图 */}
            <div className="glass rounded-3xl p-4 flex flex-col flex-1 min-h-[140px]">
              <UsageBlock
                uploadTotal={sessionUploadGb}
                downloadTotal={sessionDownloadGb}
                uploadSeries={uploadSeries}
                downloadSeries={downloadSeries}
                className="h-full"
              />
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
