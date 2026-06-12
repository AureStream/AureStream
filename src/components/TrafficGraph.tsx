import { useEffect, useRef, useState } from "react"

interface DataPoint {
  up: number
  down: number
}

interface TrafficGraphProps {
  /** Refresh interval in ms (default 1000) */
  interval?: number
  /** Time range in seconds (default 60) */
  timeRange?: number
  /** Height in px */
  height?: number
  /** Mini mode (no labels) */
  mini?: boolean
}

function generateMockData(): DataPoint {
  return {
    up: Math.max(0.1, 0.5 + Math.random() * 3.5),
    down: Math.max(0.2, 1 + Math.random() * 8),
  }
}

function formatSpeed(mbps: number): string {
  if (mbps >= 1) return `${mbps.toFixed(1)} MB/s`
  return `${(mbps * 1024).toFixed(0)} KB/s`
}

export default function TrafficGraph({
  interval = 1000,
  timeRange: _timeRange = 60,
  height = 120,
  mini = false,
}: TrafficGraphProps) {
  const [points, setPoints] = useState<DataPoint[]>(() =>
    Array.from({ length: mini ? 30 : 60 }, generateMockData)
  )
  const maxRef = useRef(10)

  useEffect(() => {
    const timer = setInterval(() => {
      setPoints((prev) => {
        const next = [...prev.slice(1), generateMockData()]
        const maxVal = Math.max(...next.flatMap((p) => [p.up, p.down]))
        maxRef.current = Math.max(maxRef.current * 0.95, maxVal * 1.15, 1)
        return next
      })
    }, interval)
    return () => clearInterval(timer)
  }, [interval])

  if (points.length === 0) return null

  const w = 600
  const h = height
  const pad = mini ? { top: 2, right: 2, bottom: 2, left: 2 } : { top: 10, right: 10, bottom: 18, left: 38 }
  const plotW = w - pad.left - pad.right
  const plotH = h - pad.top - pad.bottom
  const max = maxRef.current

  const xScale = (i: number) => pad.left + (i / (points.length - 1)) * plotW
  const yScale = (v: number) => pad.top + plotH - (v / max) * plotH

  const buildPath = (field: "up" | "down") => {
    if (points.length < 2) return ""
    let d = `M ${xScale(0)} ${yScale(points[0][field])}`
    for (let i = 1; i < points.length; i++) {
      d += ` L ${xScale(i)} ${yScale(points[i][field])}`
    }
    return d
  }

  const buildArea = (field: "up" | "down") => {
    const line = buildPath(field)
    if (!line) return ""
    const lastX = xScale(points.length - 1)
    const bottom = pad.top + plotH
    return `${line} L ${lastX} ${bottom} L ${xScale(0)} ${bottom} Z`
  }

  const last = points[points.length - 1]

  return (
    <div className="relative" style={{ width: "100%", height }}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height: "100%", display: "block" }}
      >
        {/* Grid lines */}
        {!mini && [0.25, 0.5, 0.75].map((r) => (
          <line
            key={r}
            x1={pad.left}
            x2={w - pad.right}
            y1={yScale(max * r)}
            y2={yScale(max * r)}
            stroke="currentColor"
            strokeOpacity={0.06}
            strokeWidth={1}
          />
        ))}

        {/* Download area */}
        <path d={buildArea("down")} fill="url(#downGrad)" opacity={0.35} />
        {/* Upload area */}
        <path d={buildArea("up")} fill="url(#upGrad)" opacity={0.25} />

        {/* Download line */}
        <path
          d={buildPath("down")}
          fill="none"
          stroke="#0ea5e9"
          strokeWidth={mini ? 1.5 : 2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Upload line */}
        <path
          d={buildPath("up")}
          fill="none"
          stroke="#10b981"
          strokeWidth={mini ? 1 : 1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="4 2"
        />

        {/* Y-axis labels */}
        {!mini && [0, 0.5, 1].map((r) => (
          <text
            key={r}
            x={pad.left - 6}
            y={yScale(max * r) + 4}
            textAnchor="end"
            fill="currentColor"
            fillOpacity={0.35}
            fontSize="9"
            fontFamily="var(--font-mono)"
          >
            {formatSpeed(max * r)}
          </text>
        ))}

        {/* Gradients */}
        <defs>
          <linearGradient id="downGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.6} />
            <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="upGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
        </defs>
      </svg>

      {/* Current speed overlay */}
      {!mini && (
        <div className="absolute top-2 right-3 flex gap-4 text-[11px] font-mono">
          <span style={{ color: "#0ea5e9" }}>
            ↓ {formatSpeed(last.down)}
          </span>
          <span style={{ color: "#10b981" }}>
            ↑ {formatSpeed(last.up)}
          </span>
        </div>
      )}
    </div>
  )
}
