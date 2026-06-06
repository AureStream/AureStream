import { useState, useEffect, useMemo } from "react"
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import { CartesianGrid, Area, AreaChart, XAxis } from "recharts"

import { Card, CardContent } from "@/components/ui/card"
import { surface, type as text } from "@/lib/typography"
import { cn } from "@/lib/utils"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { TrafficPoint } from "@/types/engine-state"
import { useEngineState } from "@/hooks/useEngineState"
import { subscribeTraffic } from "@/utils/singbox-api"

const HISTORY_LENGTH = 60

function createEmptyHistory(): TrafficPoint[] {
  return Array.from({ length: HISTORY_LENGTH }, () => ({
    time: "",
    download: 0,
    upload: 0,
  }))
}

function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond < 1024) return "0 KB/s"
  const kb = bytesPerSecond / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB/s`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(1)} MB/s`
  return `${(mb / 1024).toFixed(1)} GB/s`
}

function formatTotal(bytes: number, t: (key: string) => string): string {
  if (bytes === 0) return `${t("total_traffic_label")} 0 B`
  if (bytes < 1024) return `${t("total_traffic_label")} ${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${t("total_traffic_label")} ${kb.toFixed(1)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${t("total_traffic_label")} ${mb.toFixed(1)} MB`
  return `${t("total_traffic_label")} ${(mb / 1024).toFixed(1)} GB`
}

function StatBox({
  bytesPerSecond,
  totalBytes,
  type,
  t,
}: {
  bytesPerSecond: number
  totalBytes: number
  type: "upload" | "download"
  t: (key: string) => string
}) {
  const isUpload = type === "upload"
  return (
    <div className={cn(surface.chip, "flex items-center gap-2.5 flex-1 min-w-0 py-2")}>
      <div
        className={cn(
          "flex size-8 items-center justify-center rounded-lg shrink-0",
          isUpload
            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            : "bg-primary/10 text-primary"
        )}
      >
        {isUpload ? (
          <ArrowUpIcon className="size-3.5 sm:size-4" />
        ) : (
          <ArrowDownIcon className="size-3.5 sm:size-4" />
        )}
      </div>
      <div className="flex flex-col min-w-0 flex-1">
        <span className={cn(text.value, "font-mono truncate")}>
          {formatSpeed(bytesPerSecond)}
        </span>
        <span className={cn(text.caption, "truncate mt-0.5")}>
          {formatTotal(totalBytes, t)}
        </span>
      </div>
    </div>
  )
}

export function UsagePanel() {
  const { t } = useTranslation()
  const { isRunning } = useEngineState()
  const [uploadSpeed, setUploadSpeed] = useState(0)
  const [downloadSpeed, setDownloadSpeed] = useState(0)
  const [uploadTotal, setUploadTotal] = useState(0)
  const [downloadTotal, setDownloadTotal] = useState(0)
  const [history, setHistory] = useState<TrafficPoint[]>(createEmptyHistory)

  const chartConfig = useMemo(
    () =>
      ({
        download: { label: t("download"), color: "var(--primary)" },
        upload: { label: t("upload"), color: "#10b981" },
      }) satisfies ChartConfig,
    [t]
  )
  useEffect(() => {
    if (!isRunning) {
      setUploadSpeed(0)
      setDownloadSpeed(0)
      setUploadTotal(0)
      setDownloadTotal(0)
      setHistory(createEmptyHistory)
      return
    }

    const abort = new AbortController()
    let active = true

    subscribeTraffic(
      ({ up, down }) => {
        if (!active) return
        setUploadSpeed(up)
        setDownloadSpeed(down)
        setUploadTotal((prev) => prev + up)
        setDownloadTotal((prev) => prev + down)
        setHistory((prev) => {
          return [...prev.slice(1), { time: "", download: down, upload: up }]
        })
      },
      abort.signal
    ).catch((err) => {
      if (!abort.signal.aborted) {
        console.error("[UsagePanel] sing-box /traffic stream failed:", err)
      }
    })

    return () => {
      active = false
      abort.abort()
    }
  }, [isRunning])

  return (
    <Card className="flex min-h-0 flex-1 flex-col rounded-[20px] shadow-sm">
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 pt-4 pb-4 px-4">
        <div className="flex shrink-0 gap-3">
          <StatBox
            type="upload"
            bytesPerSecond={uploadSpeed}
            totalBytes={uploadTotal}
            t={t}
          />
          <StatBox
            type="download"
            bytesPerSecond={downloadSpeed}
            totalBytes={downloadTotal}
            t={t}
          />
        </div>

        <ChartContainer
          config={chartConfig}
          className="aspect-auto w-full flex-1 min-h-0 [&_.recharts-legend-wrapper]:!static [&_.recharts-legend-wrapper]:!pt-2"
          initialDimension={{ width: 280, height: 72 }}
        >
          <AreaChart
            data={history}
            margin={{ left: 0, right: 0, top: 5, bottom: 5 }}
          >
            <defs>
              <linearGradient id="colorDownload" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.22}/>
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorUpload" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.22}/>
                <stop offset="100%" stopColor="#10b981" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid
              vertical={false}
              strokeDasharray="3 3"
              stroke="var(--border)"
              className="opacity-60"
            />
            <XAxis dataKey="time" hide />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Area
              type="basis"
              dataKey="download"
              stroke="var(--primary)"
              strokeWidth={1.5}
              fillOpacity={1}
              fill="url(#colorDownload)"
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }}
              animationDuration={400}
              animationEasing="ease-out"
              isAnimationActive={true}
            />
            <Area
              type="basis"
              dataKey="upload"
              stroke="#10b981"
              strokeWidth={1.5}
              fillOpacity={1}
              fill="url(#colorUpload)"
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }}
              animationDuration={400}
              animationEasing="ease-out"
              isAnimationActive={true}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
