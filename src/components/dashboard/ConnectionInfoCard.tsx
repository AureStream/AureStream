import { useMemo, useState } from "react";
import { ChevronRight, RefreshCw, ServerOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { Node, Provider } from "@/types";

/** 大屏幕下左右两栏等高、对称拉伸 */
export const CONNECTION_CARD_STRETCH_CLASS =
  "flex h-full min-h-[min(32rem,55vh)] flex-col border-border bg-card shadow-sm";

/**
 * 「核心柱」槽位高度：仅保留时长行占位，断开/连接同高；顶栏不再垫大块留白。
 */
const MIN_DURATION_BLOCK_H = "1.75rem";
const PILL_WRAP_MIN_H = "2.125rem";
const NODE_ROW_MIN_H = "4.75rem";

const CAPTION_TONE =
  "text-[11px] font-normal uppercase tracking-[0.12em] text-muted-foreground/80";

/** 与 store 中的 bytes/s 一致的展示（同 StatusCard / Dashboard） */
function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond === 0) return "0 KB/s";
  const k = 1024;
  const sizes = ["B/s", "KB/s", "MB/s", "GB/s"];
  const i = Math.min(
    Math.floor(Math.log(bytesPerSecond) / Math.log(k)),
    sizes.length - 1,
  );
  const v = bytesPerSecond / Math.pow(k, i);
  const decimals = i >= 2 ? 1 : i === 1 ? 1 : 0;
  return `${v.toFixed(decimals)} ${sizes[i]}`;
}

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

/** 拆分节点展示名：首段视作国家/地区，其余为辅 */
function parseNodeLabels(node?: Node): {
  flag: string;
  primary: string;
  secondary: string;
} {
  if (!node?.name) {
    return { flag: "🌐", primary: "未选择", secondary: "" };
  }
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
    臺灣: "🇹🇼",
    日本: "🇯🇵",
    东京: "🇯🇵",
    東京: "🇯🇵",
    新加坡: "🇸🇬",
    美国: "🇺🇸",
    英國: "🇬🇧",
    英国: "🇬🇧",
    韩国: "🇰🇷",
    韓國: "🇰🇷",
    德国: "🇩🇪",
    法國: "🇫🇷",
    法国: "🇫🇷",
  };
  const flag = flagMap[primary] ?? "🌐";
  return { flag, primary, secondary };
}

function truncateLabel(s: string, max = 26): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** ISO 3166-1 alpha-2 → 区域指示符旗帜（非政治含义，仅 UI） */
function regionCodeToFlag(region: string): string {
  if (!/^[A-Za-z]{2}$/.test(region)) return "🌐";
  const upper = region.toUpperCase();
  const A = 0x1f1e6;
  const chars = [...upper].map((c) =>
    String.fromCodePoint(A + (c.charCodeAt(0) - 0x41)),
  );
  return chars.join("");
}

/**
 * 未连接时：用 BCP 47 地区子标签 + Intl.DisplayNames 做 best-effort 展示（无 GeoIP）。
 * `refreshKey` 变化时前端重新读取 navigator（状态刷新，不调接口）。
 */
function detectRegionFromNavigator(refreshKey: number): {
  flag: string;
  regionLabel: string;
  subHint: string;
  ok: boolean;
} {
  void refreshKey;
  if (typeof navigator === "undefined") {
    return {
      flag: "🌐",
      regionLabel: "无法检测",
      subHint: "非浏览器环境，无法读取系统语言与地区。",
      ok: false,
    };
  }

  const tryLocaleStrings = [
    ...(typeof navigator.language === "string" && navigator.language.trim()
      ? [navigator.language.trim()]
      : []),
    ...(navigator.languages ?? []).filter(
      (s): s is string => typeof s === "string",
    ),
  ];

  let regionSubtag: string | null = null;
  let sourceLocale = "";

  for (const loc of tryLocaleStrings) {
    const m = /^[a-z]{2,3}-([a-z]{2}|\d{3})\b/i.exec(loc);
    if (m) {
      regionSubtag = m[1].toUpperCase();
      sourceLocale = loc;
      break;
    }
  }

  if (!regionSubtag) {
    return {
      flag: "🌐",
      regionLabel: "无法检测",
      subHint:
        "系统首选语言不含地区代码。可在系统设置中配置区域或使用「刷新」重新读取。",
      ok: false,
    };
  }

  let localized = "";
  const displayLocales = [
    ...new Set([sourceLocale, navigator.language, "zh-CN", "en"]),
  ];
  try {
    const dn = new Intl.DisplayNames(displayLocales, { type: "region" });
    localized = dn.of(regionSubtag) ?? "";
  } catch {
    localized = "";
  }

  if (!localized.trim()) {
    localized = regionSubtag;
  }

  const flag = /^[A-Z]{2}$/.test(regionSubtag)
    ? regionCodeToFlag(regionSubtag)
    : "🌐";

  return {
    flag,
    regionLabel: localized,
    subHint: `由系统语言地区子标签 «${regionSubtag}» 推断，可能与实际地理位置不一致。`,
    ok: true,
  };
}

export interface ConnectionInfoCardProps {
  className?: string;
  isConnected: boolean;
  canConnect: boolean;
  currentProvider: Provider | null | undefined;
  availableNodes: Node[];
  currentNode?: Node;
  connectedAt?: number;
  nowTick: number;
  downloadSpeed: number;
  uploadSpeed: number;
  onOpenProviders?: () => void;
  onOpenNodePicker: () => void;
}

export function ConnectionInfoCard({
  className,
  isConnected,
  canConnect,
  currentProvider,
  availableNodes,
  currentNode,
  connectedAt,
  nowTick,
  downloadSpeed,
  uploadSpeed,
  onOpenProviders,
  onOpenNodePicker,
}: ConnectionInfoCardProps) {
  const [regionSnap, setRegionSnap] = useState(0);

  const elapsedSec =
    isConnected && connectedAt
      ? Math.max(0, Math.floor((nowTick - connectedAt) / 1000))
      : 0;

  const activeNode =
    currentNode ?? (availableNodes.length > 0 ? availableNodes[0] : undefined);
  const nodeLine = parseNodeLabels(activeNode);

  /** 不与上方「国旗 + primary」重复的辅信息（caption 后缀） */
  const mutedNodeMeta = (() => {
    if (!activeNode) return "";
    if (typeof activeNode.delay === "number") {
      return truncateLabel(`${activeNode.delay} ms`, 42);
    }
    return truncateLabel(`${activeNode.server}:${activeNode.port}`, 42);
  })();

  /** 单行 muted：次级信息，与「出口节点」caption 并排，整块最多两行（caption 行 + 粗体节点名）。 */
  const captionSuffix = mutedNodeMeta ? ` · ${mutedNodeMeta}` : "";

  const pickerTitle = activeNode
    ? `${activeNode.name}\n${activeNode.server}:${activeNode.port}${activeNode.delay != null ? `\n${activeNode.delay} ms` : ""}`
    : "";

  const noProvider = !currentProvider;
  const noNodesForProvider =
    Boolean(currentProvider) && availableNodes.length === 0;

  const localRegion = useMemo(
    () => detectRegionFromNavigator(regionSnap),
    [regionSnap],
  );

  let gateTitle = "准备就绪";
  let gateBody = "选择节点后点击下方按钮即可连接代理。";

  if (noProvider) {
    gateTitle = "尚未设置订阅";
    gateBody = "请先在「服务商」页面启用当前订阅，同步节点后即可在此发起连接。";
  } else if (noNodesForProvider) {
    gateTitle = "当前无可选节点";
    gateBody = "该订阅下暂时没有可用节点，请检查订阅或尝试重新导入。";
  }

  return (
    <Card className={cn(CONNECTION_CARD_STRETCH_CLASS, className)}>
      <CardHeader className="shrink-0 pb-3 pt-4">
        <div className="flex flex-col gap-2">
          <CardTitle className="text-base">连接操作</CardTitle>
          <CardDescription>
            {isConnected
              ? "会话时长、速率与出口节点"
              : "本地区域参考与节点选择"}
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
        {/* 核心柱：时长 + 速率胶囊 */}
        <div className="flex w-full shrink-0 flex-col gap-3">
          <div
            className="flex shrink-0 flex-col items-center justify-center overflow-hidden text-center"
            style={{ minHeight: MIN_DURATION_BLOCK_H }}
          >
            {!isConnected ? (
              <p
                className="pointer-events-none select-none text-[1.65rem] font-semibold tabular-nums leading-none tracking-tight text-transparent sm:text-[1.85rem]"
                aria-hidden
              >
                {formatDuration(0)}
              </p>
            ) : (
              <p className="text-[1.65rem] font-semibold tabular-nums leading-none tracking-tight text-foreground sm:text-[1.85rem]">
                {formatDuration(elapsedSec)}
              </p>
            )}
          </div>

          {/* 速率胶囊 */}
          <div
            className={cn(
              "flex shrink-0 items-center justify-center overflow-hidden px-1",
              !isConnected && "pointer-events-none select-none",
            )}
            style={{ minHeight: PILL_WRAP_MIN_H }}
          >
            <div
              className={cn(
                "inline-flex max-w-full items-center gap-2.5 rounded-full border border-border/70 bg-muted/45 px-3.5 py-1.5 text-[11px] tabular-nums text-muted-foreground",
                !isConnected && "invisible",
              )}
              aria-hidden={!isConnected}
            >
              <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap">
                <span className="text-foreground/70" aria-hidden>
                  ↓
                </span>
                <span>{formatSpeed(downloadSpeed)}</span>
              </span>
              <Separator
                orientation="vertical"
                className="h-3.5 bg-border/80"
                decorative
              />
              <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap">
                <span className="text-foreground/70" aria-hidden>
                  ↑
                </span>
                <span>{formatSpeed(uploadSpeed)}</span>
              </span>
            </div>
          </div>

          {/* 未连接：本地区域估算（置于 ConnectButton + 速率胶囊占位之下） */}
          {!isConnected ? (
            <div className="flex w-full shrink-0 flex-col gap-2">
              <div
                className="flex min-h-0 w-full items-center gap-2 rounded-xl border border-border/60 bg-muted/25 px-3 py-2"
                aria-live="polite"
              >
                <span className={cn(CAPTION_TONE, "shrink-0")}>
                  当前国家估算
                </span>
                <span className="text-lg leading-none" aria-hidden>
                  {localRegion.flag}
                </span>
                <p className="min-w-0 flex-1 truncate text-sm font-medium tabular-nums text-foreground">
                  {localRegion.regionLabel}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 rounded-lg text-muted-foreground hover:text-foreground"
                  aria-label="重新读取本地区域（仅刷新前端状态）"
                  onClick={() => setRegionSnap((k) => k + 1)}
                >
                  <RefreshCw className="size-4" />
                </Button>
              </div>
              <CardDescription className="px-px text-[11px] leading-relaxed">
                {localRegion.subHint}
              </CardDescription>
            </div>
          ) : null}
        </div>

        <Separator className="shrink-0" />

        {/* 底部：仅已连接时展示紧凑节点入口；断开无节点预览条（必要时占位保持版心） */}
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          {isConnected ? (
            <>
              {/* Separator 上为速率胶囊；下为属地摘要窄带（11px muted + 国旗）；caption 后缀已避免再写一遍 primary */}
              <div
                role="presentation"
                className="flex w-full shrink-0 items-center gap-2 rounded-md bg-muted/25 px-2 py-1 text-muted-foreground"
              >
                <span
                  className="select-none text-[11px] leading-none"
                  aria-hidden
                >
                  {nodeLine.flag}
                </span>
                <span className="min-w-0 truncate text-[11px] font-normal leading-snug tracking-tight">
                  {nodeLine.primary}
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={!canConnect}
                title={pickerTitle || undefined}
                aria-label={`出口节点 · ${activeNode?.name ?? "未选择"}。打开节点选择。`}
                onClick={() => onOpenNodePicker()}
                className="group flex h-auto min-h-[4.75rem] w-full flex-row items-center justify-start gap-3 whitespace-normal rounded-xl px-3 py-2.5 text-left font-normal"
              >
                <span
                  className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-muted/40 text-muted-foreground"
                  aria-hidden
                >
                  {nodeLine.flag !== "🌐" ? (
                    <span className="select-none text-base leading-none">
                      {nodeLine.flag}
                    </span>
                  ) : (
                    <span className="select-none px-1 text-center text-[10px] font-medium leading-snug tracking-tight">
                      节点
                    </span>
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col items-start justify-center gap-0.5 text-left">
                  <span className="flex min-w-0 max-w-full items-baseline truncate text-left leading-tight">
                    <span className={cn(CAPTION_TONE, "shrink-0")}>
                      出口节点
                    </span>
                    {captionSuffix ? (
                      <span className="min-w-0 truncate text-[11px] font-normal normal-case tracking-normal text-muted-foreground/90 tabular-nums">
                        {captionSuffix}
                      </span>
                    ) : null}
                  </span>
                  <span className="truncate text-sm font-semibold text-foreground">
                    {activeNode?.name ?? "未选择"}
                  </span>
                </span>
                <span
                  className="ml-auto inline-flex shrink-0 text-muted-foreground group-hover:text-foreground"
                  aria-hidden
                >
                  <ChevronRight className="size-5" />
                </span>
              </Button>
            </>
          ) : (
            <>
              {/* 与原「紧凑节点选择条」等高，断开时无节点区块也不顶起会话区按钮 */}
              {!(noProvider || noNodesForProvider) ? (
                <div
                  aria-hidden
                  className="pointer-events-none shrink-0 select-none"
                  style={{ minHeight: NODE_ROW_MIN_H }}
                />
              ) : null}

              {(noProvider || noNodesForProvider) && (
                <div className="flex flex-col gap-4 rounded-xl border border-dashed border-border/80 bg-muted/15 p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground">
                      <ServerOff className="size-5" aria-hidden />
                    </div>
                    <div className="flex flex-col gap-1">
                      <p className="text-sm font-semibold text-foreground">
                        {gateTitle}
                      </p>
                      <p className="text-pretty text-sm text-muted-foreground">
                        {gateBody}
                      </p>
                    </div>
                  </div>
                  {noProvider && onOpenProviders ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full rounded-xl sm:w-auto"
                      onClick={onOpenProviders}
                    >
                      前往服务商
                    </Button>
                  ) : null}
                </div>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
