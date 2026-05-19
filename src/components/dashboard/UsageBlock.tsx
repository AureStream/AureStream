import { ChartBar } from "lucide-react";
import { cn } from "@/lib/utils";

const VIEW_W = 200;
const VIEW_H = 56;
const PAD_X = 4;
const PAD_Y = 6;

function formatVolumeGb(gb?: number): string {
  if (gb == null || !Number.isFinite(gb)) return "暂无";
  if (gb < 0) return "暂无";
  if (gb < 1 / 1024) return `${(gb * 1024 * 1024).toFixed(0)} KB`;
  if (gb < 1) return `${(gb * 1024).toFixed(1)} MB`;
  return `${gb.toFixed(2)} GB`;
}

/** 将数据点转为平滑曲线 path — 使用 Catmull-Rom → 三次贝塞尔 */
function buildSmoothPath(
  values: readonly number[],
  width: number,
  height: number,
): string {
  const n = values.length;
  if (n < 2) return "";

  const innerW = width - PAD_X * 2;
  const innerH = height - PAD_Y * 2;
  const bottom = height - PAD_Y;

  let vmin = Infinity;
  let vmax = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = values[i]!;
    if (v < vmin) vmin = v;
    if (v > vmax) vmax = v;
  }
  if (vmax - vmin < 1024) vmax = vmin + 8192;

  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const x = PAD_X + (i / Math.max(n - 1, 1)) * innerW;
    const t = (values[i]! - vmin) / (vmax - vmin);
    const y = PAD_Y + innerH * (1 - Math.min(1, Math.max(0, t)));
    pts.push({ x, y });
  }

  // Catmull-Rom → cubic bezier
  let d = `M ${pts[0]!.x},${pts[0]!.y}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[Math.min(n - 1, i + 2)]!;

    const tension = 0.3;
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }

  // 面积路径：曲线 + 底部水平线闭合
  const areaD = `${d} L ${pts[n - 1]!.x},${bottom} L ${pts[0]!.x},${bottom} Z`;

  return areaD;
}

/** 纯曲线 path（无线下填充，用于上层描边） */
function buildSmoothLine(
  values: readonly number[],
  width: number,
  height: number,
): string {
  const n = values.length;
  if (n < 2) return "";

  const innerW = width - PAD_X * 2;
  const innerH = height - PAD_Y * 2;

  let vmin = Infinity;
  let vmax = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = values[i]!;
    if (v < vmin) vmin = v;
    if (v > vmax) vmax = v;
  }
  if (vmax - vmin < 1024) vmax = vmin + 8192;

  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const x = PAD_X + (i / Math.max(n - 1, 1)) * innerW;
    const t = (values[i]! - vmin) / (vmax - vmin);
    const y = PAD_Y + innerH * (1 - Math.min(1, Math.max(0, t)));
    pts.push({ x, y });
  }

  let d = `M ${pts[0]!.x},${pts[0]!.y}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[Math.min(n - 1, i + 2)]!;

    const tension = 0.3;
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }

  return d;
}

const CHART_GRAD_ID = "usage-chart";

export function UsageBlock({
  uploadTotal,
  downloadTotal,
  uploadSeries,
  downloadSeries,
  className,
}: {
  uploadTotal?: number;
  downloadTotal?: number;
  uploadSeries: number[];
  downloadSeries: number[];
  className?: string;
}) {
  const hasVolume = uploadTotal != null || downloadTotal != null;
  const total = hasVolume
    ? (uploadTotal ?? 0) + (downloadTotal ?? 0)
    : undefined;
  const downloadArea = buildSmoothPath(downloadSeries, VIEW_W, VIEW_H);
  const uploadArea = buildSmoothPath(uploadSeries, VIEW_W, VIEW_H);
  const downloadLine = buildSmoothLine(downloadSeries, VIEW_W, VIEW_H);
  const uploadLine = buildSmoothLine(uploadSeries, VIEW_W, VIEW_H);
  const noData =
    uploadSeries.every((v) => v === 0) && downloadSeries.every((v) => v === 0);

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex items-start gap-2.5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <ChartBar className="size-4 text-primary" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-foreground">
            用量信息
          </span>
          <span className="text-[10px] leading-tight text-muted-foreground">
            内核本会话累计（非订阅账单）
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col gap-0.5 rounded-lg bg-muted/40 px-3 py-2">
          <span className="text-[10px] text-muted-foreground">上传</span>
          <span className="text-xs font-semibold tabular-nums text-foreground">
            {formatVolumeGb(uploadTotal)}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 rounded-lg bg-muted/40 px-3 py-2">
          <span className="text-[10px] text-muted-foreground">下载</span>
          <span className="text-xs font-semibold tabular-nums text-foreground">
            {formatVolumeGb(downloadTotal)}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 rounded-lg bg-muted/40 px-3 py-2">
          <span className="text-[10px] text-muted-foreground">总计</span>
          <span className="text-xs font-semibold tabular-nums text-foreground">
            {formatVolumeGb(total)}
          </span>
        </div>
      </div>

      {/* 波浪面积图 — 随容器自适应高度 */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden rounded-lg border border-border bg-muted/25 px-2 py-3">
        <div className="mb-2 shrink-0 flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block size-2 rounded-full bg-primary"
              aria-hidden
            />
            下载
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block size-2 rounded-full bg-emerald-500"
              aria-hidden
            />
            上传
          </span>
        </div>
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="flex-1 min-h-[3rem] w-full"
          preserveAspectRatio="none"
          aria-hidden
        >
          <defs>
            <linearGradient
              id={`${CHART_GRAD_ID}-down`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="0%"
                stopColor="var(--color-primary)"
                stopOpacity="0.25"
              />
              <stop
                offset="100%"
                stopColor="var(--color-primary)"
                stopOpacity="0.02"
              />
            </linearGradient>
            <linearGradient
              id={`${CHART_GRAD_ID}-up`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="0%"
                stopColor="var(--color-emerald-500)"
                stopOpacity="0.22"
              />
              <stop
                offset="100%"
                stopColor="var(--color-emerald-500)"
                stopOpacity="0.01"
              />
            </linearGradient>
          </defs>
          <rect width={VIEW_W} height={VIEW_H} className="fill-transparent" />
          {noData ? (
            <line
              x1={PAD_X}
              y1={VIEW_H / 2}
              x2={VIEW_W - PAD_X}
              y2={VIEW_H / 2}
              className="stroke-muted-foreground/20 [vector-effect:non-scaling-stroke]"
              strokeWidth="1"
              strokeDasharray="3 6"
            />
          ) : (
            <>
              {/* 下载面积 + 描边 */}
              {downloadArea ? (
                <path
                  d={downloadArea}
                  fill={`url(#${CHART_GRAD_ID}-down)`}
                  stroke="none"
                />
              ) : null}
              {downloadLine ? (
                <path
                  d={downloadLine}
                  fill="none"
                  className="stroke-primary [vector-effect:non-scaling-stroke]"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}
              {/* 上传面积 + 描边 */}
              {uploadArea ? (
                <path
                  d={uploadArea}
                  fill={`url(#${CHART_GRAD_ID}-up)`}
                  stroke="none"
                />
              ) : null}
              {uploadLine ? (
                <path
                  d={uploadLine}
                  fill="none"
                  className="stroke-emerald-500 [vector-effect:non-scaling-stroke]"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}
            </>
          )}
        </svg>
      </div>
    </div>
  );
}
