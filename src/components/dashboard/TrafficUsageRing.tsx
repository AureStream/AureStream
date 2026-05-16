import { cn } from "@/lib/utils";

const R = 38;
const STROKE = 7;
const VIEW = (R + STROKE / 2) * 2;
const C = 2 * Math.PI * R;

/** 流量用量环形指示（纯 SVG，语义色）。 */
export function TrafficUsageRing({
  pct,
  className,
  caption,
}: {
  /** 0–100 */
  pct: number;
  className?: string;
  caption?: string;
}) {
  const clamped = Math.min(100, Math.max(0, pct));
  const offset = C * (1 - clamped / 100);

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <div className="relative flex size-[5.5rem] sm:size-[6.5rem] lg:size-[8.5rem] items-center justify-center shrink-0">
        <svg
          width={VIEW}
          height={VIEW}
          viewBox={`0 0 ${VIEW} ${VIEW}`}
          className="size-full max-h-[5.5rem] max-w-[5.5rem] sm:max-h-[6.5rem] sm:max-w-[6.5rem] lg:max-h-[8.5rem] lg:max-w-[8.5rem] shrink-0 -rotate-90"
          aria-hidden
        >
          <circle
            cx={VIEW / 2}
            cy={VIEW / 2}
            r={R}
            fill="none"
            className="stroke-muted"
            strokeWidth={STROKE}
          />
          <circle
            cx={VIEW / 2}
            cy={VIEW / 2}
            r={R}
            fill="none"
            className="stroke-primary transition-[stroke-dashoffset] duration-500 ease-out"
            strokeWidth={STROKE}
            strokeDasharray={C}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-xl font-bold tabular-nums leading-none tracking-tight text-foreground">
            {clamped.toFixed(0)}
            <span className="text-xs font-semibold text-muted-foreground">
              %
            </span>
          </span>
        </div>
      </div>
      {caption ? (
        <span className="text-center text-[10px] font-medium text-muted-foreground">
          {caption}
        </span>
      ) : null}
    </div>
  );
}
