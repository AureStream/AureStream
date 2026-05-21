import { useRef, useState, useCallback } from "react";
import {
  Package,
  RefreshCw,
  Pencil,
  Trash2,
  Clock,
  CalendarClock,
  Loader2,
  HardDrive,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Provider } from "@/types";

interface ProviderCardProps {
  provider: Provider;
  isActive?: boolean;
  isRefreshing?: boolean;
  onSetActive: (provider: Provider) => void;
  onEdit: (provider: Provider) => void;
  onDelete: (id: string) => void;
  onRefresh: (id: string) => void;
}

function formatTrafficGB(gb?: number): string {
  if (gb == null || !Number.isFinite(gb)) return "—";
  return `${gb.toFixed(1)}`;
}

function formatExpiry(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatLastSubscriptionUpdate(raw?: string): string {
  if (!raw?.trim()) return "暂无";
  const d = new Date(raw.trim());
  if (Number.isNaN(d.getTime())) return raw.trim();
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Width of the revealed action panel in px */
const ACTION_WIDTH = 160;
/** Minimum drag distance to snap open */
const SNAP_THRESHOLD = 44;

export function ProviderCard({
  provider,
  isActive = false,
  isRefreshing = false,
  onSetActive,
  onEdit,
  onDelete,
  onRefresh,
}: ProviderCardProps) {
  const trafficTotal = provider.trafficTotalGB;
  const trafficUsed = provider.trafficUsedGB;
  const trafficRemaining =
    trafficTotal != null && trafficTotal > 0 && trafficUsed != null
      ? Math.max(0, trafficTotal - trafficUsed)
      : undefined;
  const trafficPct =
    trafficTotal != null &&
    trafficTotal > 0 &&
    trafficUsed != null &&
    Number.isFinite(trafficUsed)
      ? Math.min(100, Math.max(0, (trafficUsed / trafficTotal) * 100))
      : undefined;

  // ── Swipe state ──────────────────────────────────────────────────────────
  const [isSwipeOpen, setIsSwipeOpen] = useState(false);
  const [liveOffset, setLiveOffset] = useState(0); // px while dragging
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startOffsetRef = useRef(0);
  const didMoveRef = useRef(false);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Only initiate on primary pointer (mouse left / single touch)
      if (e.button !== 0 && e.pointerType === "mouse") return;
      isDraggingRef.current = true;
      didMoveRef.current = false;
      startXRef.current = e.clientX;
      startOffsetRef.current = isSwipeOpen ? ACTION_WIDTH : 0;
      setLiveOffset(startOffsetRef.current);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [isSwipeOpen],
  );

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    const delta = startXRef.current - e.clientX; // positive → swiping left
    if (Math.abs(delta) > 4) didMoveRef.current = true;
    const next = Math.max(0, Math.min(ACTION_WIDTH, startOffsetRef.current + delta));
    setLiveOffset(next);
  }, []);

  const handlePointerUp = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    // Snap logic
    const open =
      liveOffset >= SNAP_THRESHOLD &&
      !(isSwipeOpen && liveOffset < ACTION_WIDTH / 2);
    setIsSwipeOpen(open);
    setLiveOffset(open ? ACTION_WIDTH : 0);
  }, [liveOffset, isSwipeOpen]);

  const handleCardClick = useCallback(() => {
    // If this was actually a drag gesture, ignore the click
    if (didMoveRef.current) return;
    // If actions are revealed, tap on card body to close
    if (isSwipeOpen) {
      setIsSwipeOpen(false);
      setLiveOffset(0);
      return;
    }
    onSetActive(provider);
  }, [isSwipeOpen, onSetActive, provider]);

  const slideX = isDraggingRef.current ? liveOffset : isSwipeOpen ? ACTION_WIDTH : 0;
  const cardTransform = `translateX(-${slideX}px)`;
  const cardTransition = isDraggingRef.current
    ? "none"
    : "transform 0.32s cubic-bezier(0.4, 0, 0.2, 1)";

  return (
    /* Outer clip: hides anything that spills outside the rounded rect */
    <div className="relative overflow-hidden rounded-3xl h-full">

      {/* ── Action panel (revealed by swiping) ───────────────────────── */}
      <div
        className="absolute right-0 top-0 bottom-0 flex items-center justify-center gap-5 px-6"
        style={{ width: ACTION_WIDTH }}
        aria-hidden={!isSwipeOpen}
      >
        {/* Edit button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsSwipeOpen(false);
            setLiveOffset(0);
            onEdit(provider);
          }}
          className="flex items-center justify-center w-11 h-11 shrink-0 rounded-full bg-primary/12 dark:bg-primary/20 hover:bg-primary/20 dark:hover:bg-primary/30 text-primary transition-all active:scale-90"
          aria-label="编辑"
        >
          <Pencil className="w-[18px] h-[18px]" strokeWidth={2} />
        </button>

        {/* Delete button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsSwipeOpen(false);
            setLiveOffset(0);
            onDelete(provider.id);
          }}
          className="flex items-center justify-center w-11 h-11 shrink-0 rounded-full bg-red-500/12 dark:bg-red-500/20 hover:bg-red-500/22 dark:hover:bg-red-500/30 text-red-500 transition-all active:scale-90"
          aria-label="删除"
        >
          <Trash2 className="w-[18px] h-[18px]" strokeWidth={2} />
        </button>
      </div>

      {/* ── Sliding card content ─────────────────────────────────────── */}
      <div
        className={cn(
          "glass h-full relative cursor-pointer touch-pan-y select-none overflow-hidden",
          "rounded-3xl",
          isActive
            ? "ring-1 ring-primary/30 shadow-[0_0_24px_rgba(59,130,246,0.15)]"
            : "hover:shadow-[var(--shadow-glass-hover)]",
          // Suppress the built-in active:scale while dragging
          isDraggingRef.current && "active:transform-none",
        )}
        style={{ transform: cardTransform, transition: cardTransition }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={handleCardClick}
      >
        {/* 使用中 - 左上角 45° 斜贴条 */}
        {isActive && (
          <div className="absolute top-3 -left-8 z-10 pointer-events-none">
            <div className="bg-gradient-to-r from-primary to-indigo-500 text-white text-[10px] font-medium py-1 px-10 rotate-[-45deg] shadow-md">
              使用中
            </div>
          </div>
        )}

        {/* 右上角：仅保留刷新订阅按钮 */}
        <div className="absolute top-2 right-2 z-10">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRefresh(provider.id);
            }}
            disabled={isRefreshing}
            className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors touch-manipulation disabled:opacity-50"
            aria-label="刷新订阅"
          >
            {isRefreshing ? (
              <Loader2
                className="w-4 h-4 text-muted-foreground animate-spin"
                strokeWidth={2.5}
              />
            ) : (
              <RefreshCw
                className="w-4 h-4 text-muted-foreground"
                strokeWidth={2.5}
              />
            )}
          </button>
        </div>

        {/* 顶部装饰条 */}
        <div
          className={cn(
            "h-1 transition-colors duration-300",
            isActive
              ? "bg-gradient-to-r from-primary via-indigo-500 to-primary"
              : "bg-gradient-to-r from-primary/40 via-indigo-500/30 to-transparent",
          )}
        />

        <div className="p-4 sm:p-5 flex flex-col gap-3.5 h-full">
          {/* 头部：名称 */}
          <div className="flex items-center gap-2.5 min-w-0 pt-1">
            <div
              className={cn(
                "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors duration-300",
                isActive ? "bg-primary/15" : "bg-muted/50",
              )}
            >
              <Package
                className={cn(
                  "w-4.5 h-4.5",
                  isActive ? "text-primary" : "text-muted-foreground",
                )}
                strokeWidth={1.75}
              />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm truncate text-foreground">
                {provider.name}
              </h3>
            </div>
          </div>

          {/* 订阅信息行 */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-muted/40 text-[11px] text-muted-foreground">
              <CalendarClock
                className="w-3 h-3 opacity-60 shrink-0"
                aria-hidden
              />
              <span className="text-muted-foreground/85">更新订阅</span>
              <span className="font-medium tabular-nums text-foreground/90">
                {formatLastSubscriptionUpdate(provider.lastUpdated)}
              </span>
            </span>
            {provider.expiresAt && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-muted/40 text-[11px] text-muted-foreground">
                <Clock className="w-3 h-3 opacity-60" />
                {formatExpiry(provider.expiresAt)}
              </span>
            )}
            {provider.autoUpdateInterval && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/8 text-primary text-[11px]">
                <RefreshCw className="w-3 h-3" />每 {provider.autoUpdateInterval}m
              </span>
            )}
          </div>

          {/* 流量信息 */}
          <div className="flex-1 flex flex-col justify-center">
            {trafficTotal != null ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] text-muted-foreground">
                    流量使用
                  </span>
                  <span className="text-xs tabular-nums">
                    <span className="font-semibold text-foreground">
                      {formatTrafficGB(trafficUsed)}
                    </span>
                    <span> GB / </span>
                    <span className="text-foreground">
                      {formatTrafficGB(trafficTotal)} GB
                    </span>
                  </span>
                </div>
                <div className="relative h-1.5 w-full rounded-full bg-muted/50 overflow-hidden">
                  <div
                    className={cn(
                      "absolute inset-y-0 left-0 rounded-full transition-all duration-500",
                      trafficPct != null && trafficPct > 90
                        ? "bg-red-400"
                        : trafficPct != null && trafficPct > 70
                          ? "bg-yellow-400"
                          : "bg-primary",
                    )}
                    style={{ width: `${trafficPct ?? 0}%` }}
                  />
                </div>
                {trafficRemaining != null && (
                  <p className="text-[11px] text-muted-foreground">
                    剩余{" "}
                    <span className="font-medium text-foreground tabular-nums">
                      {trafficRemaining.toFixed(1)} GB
                    </span>
                  </p>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
                <HardDrive className="w-3.5 h-3.5" />
                <span>暂无流量信息</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
