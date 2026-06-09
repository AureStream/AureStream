import { useId, type CSSProperties } from "react"

import { cn } from "@/lib/utils"

type CircularLoaderProps = {
  size?: number
  withLogo?: boolean
  className?: string
}

export function CircularLoader({
  size = 112,
  withLogo = false,
  className,
}: CircularLoaderProps) {
  const rawId = useId().replace(/:/g, "")
  const outerGrad = `${rawId}-outer`
  const innerGrad = `${rawId}-inner`
  const innerSize = Math.round(size * 0.76)
  const innerOffset = (size - innerSize) / 2

  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
      role="status"
      aria-label="Loading"
    >
      <div
        className="absolute inset-0 rounded-full bg-primary/10 blur-2xl"
        aria-hidden
      />

      <SpinnerArc
        size={size}
        gradientId={outerGrad}
        className="absolute inset-0 animate-[loader-spin_1.05s_cubic-bezier(0.45,0,0.55,1)_infinite]"
        strokeWidth={3}
        arcRatio={0.3}
        trackClassName="stroke-primary/10 dark:stroke-primary/15"
      />

      <SpinnerArc
        size={innerSize}
        gradientId={innerGrad}
        className="animate-[loader-spin-reverse_1.35s_cubic-bezier(0.45,0,0.55,1)_infinite]"
        strokeWidth={2.5}
        arcRatio={0.22}
        trackClassName="stroke-primary/8 dark:stroke-primary/12"
        style={{ left: innerOffset, top: innerOffset }}
      />

      {withLogo ? (
        <div
          className="absolute flex items-center justify-center rounded-full bg-gradient-to-br from-[#4d73ff] to-[#254eff] shadow-[0_10px_28px_rgba(37,99,235,0.32)]"
          style={{ inset: size * 0.24 }}
        >
          <img
            src="/logo2.png"
            alt=""
            className="object-contain"
            style={{ width: "58%", height: "58%" }}
            draggable={false}
          />
        </div>
      ) : (
        <div
          className="absolute rounded-full bg-primary/25 blur-md animate-pulse"
          style={{ inset: size * 0.38 }}
          aria-hidden
        />
      )}

      <svg width="0" height="0" className="absolute" aria-hidden>
        <defs>
          <linearGradient id={outerGrad} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#6366f1" />
          </linearGradient>
          <linearGradient id={innerGrad} x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#60a5fa" />
            <stop offset="100%" stopColor="#4f46e5" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  )
}

function SpinnerArc({
  size,
  gradientId,
  className,
  strokeWidth,
  arcRatio,
  trackClassName,
  style,
}: {
  size: number
  gradientId: string
  className?: string
  strokeWidth: number
  arcRatio: number
  trackClassName: string
  style?: CSSProperties
}) {
  const radius = (size - strokeWidth) / 2 - 1
  const center = size / 2
  const circumference = 2 * Math.PI * radius
  const arc = circumference * arcRatio

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn("absolute", className)}
      style={style}
      aria-hidden
    >
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        className={trackClassName}
        strokeWidth={strokeWidth}
      />
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={`${arc} ${circumference - arc}`}
        transform={`rotate(-90 ${center} ${center})`}
      />
    </svg>
  )
}
