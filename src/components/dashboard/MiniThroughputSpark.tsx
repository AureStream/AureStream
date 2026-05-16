import { cn } from "@/lib/utils";

const VIEW_W = 160;
const VIEW_H = 40;

/** 自下而上填满的迷你面积 Sparkline（纯 SVG）；横轴铺满 flex 宽度。 */
export function MiniThroughputSpark({
  label,
  speedText,
  values,
  tone = "primary",
}: {
  label: string;
  speedText: string;
  values: readonly number[];
  tone?: "primary" | "accent";
}) {
  const strokeTone =
    tone === "primary" ? "stroke-primary" : "stroke-accent-foreground";
  const fillTone = tone === "primary" ? "fill-primary/18" : "fill-accent/30";

  const { areaPath, linePath } = sparkPaths(values, VIEW_W, VIEW_H);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        <span className="truncate text-sm font-semibold tabular-nums text-foreground">
          {speedText}
        </span>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-muted/25">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="aspect-[4/1] h-auto w-full min-h-[2.75rem]"
          preserveAspectRatio="none"
          aria-hidden
        >
          <rect width={VIEW_W} height={VIEW_H} className="fill-transparent" />
          {areaPath ? (
            <path d={areaPath} className={cn(fillTone)} stroke="none" />
          ) : null}
          {linePath ? (
            <path
              d={linePath}
              fill="none"
              className={cn(
                strokeTone,
                "[vector-effect:non-scaling-stroke] stroke-[1.25px]",
              )}
            />
          ) : (
            <line
              x1={6}
              y1={VIEW_H / 2}
              x2={VIEW_W - 6}
              y2={VIEW_H / 2}
              fill="none"
              className={cn(
                strokeTone,
                "[vector-effect:non-scaling-stroke] stroke-[1px] opacity-35",
              )}
              strokeDasharray="3 6"
            />
          )}
        </svg>
      </div>
    </div>
  );
}

function sparkPaths(values: readonly number[], width: number, height: number) {
  const padX = 4;
  const padY = 4;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const bottom = height - padY;

  const n = values.length;
  if (n < 2) {
    return { areaPath: "", linePath: "" };
  }

  const vmin = Math.min(...values);
  let vmax = Math.max(...values, vmin + 1e-6);
  if (vmax - vmin < 1024 && vmax <= 8192) {
    vmax = vmin + 8192;
  }

  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const x = padX + (i / Math.max(n - 1, 1)) * innerW;
    const t = (values[i]! - vmin) / (vmax - vmin);
    const y = padY + innerH * (1 - Math.min(1, Math.max(0, t)));
    pts.push({ x, y });
  }

  let linePath = "";
  pts.forEach((p, i) => {
    linePath += i === 0 ? `M ${p.x},${p.y}` : ` L ${p.x},${p.y}`;
  });

  const first = pts[0];
  const last = pts[n - 1];
  const areaPath = `M ${first!.x},${bottom} L ${first!.x},${first!.y}${pts
    .slice(1)
    .map((p) => ` L ${p.x},${p.y}`)
    .join("")} L ${last!.x},${bottom} Z`;

  return { areaPath, linePath };
}
