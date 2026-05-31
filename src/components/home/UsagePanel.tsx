import { useState, useEffect } from "react"
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react"
import { CartesianGrid, Line, LineChart, XAxis } from "recharts"

import { Card, CardContent } from "@/components/ui/card"
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
import { getClashApiSecret } from "@/single/store"

const chartConfig = {
  download: { label: "下载", color: "#3b59ff" },
  upload: { label: "上传", color: "#10b981" },
} satisfies ChartConfig

function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond < 1024) return "0 KB/s"
  const kb = bytesPerSecond / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB/s`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(1)} MB/s`
  return `${(mb / 1024).toFixed(1)} GB/s`
}

function formatTotal(bytes: number): string {
  if (bytes === 0) return "累计 0 B"
  if (bytes < 1024) return `累计 ${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `累计 ${kb.toFixed(1)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `累计 ${mb.toFixed(1)} MB`
  return `累计 ${(mb / 1024).toFixed(1)} GB`
}

function StatBox({
  label,
  bytesPerSecond,
  totalBytes,
  type,
}: {
  label: string
  bytesPerSecond: number
  totalBytes: number
  type: "upload" | "download"
}) {
  const isUpload = type === "upload"
  return (
    <div className="flex items-center gap-3 rounded-[14px] border border-slate-100 dark:border-white/[0.08] bg-[#f8fafc]/30 dark:bg-white/[0.04] px-3 py-2.5 flex-1 min-w-0">
      <div
        className={`flex size-8 items-center justify-center rounded-lg shrink-0 ${
          isUpload
            ? "bg-emerald-50 text-emerald-500 dark:bg-emerald-500/10 dark:text-emerald-400"
            : "bg-blue-50 text-blue-500 dark:bg-blue-500/10 dark:text-blue-400"
        }`}
      >
        {isUpload ? (
          <ArrowUpIcon className="size-4" />
        ) : (
          <ArrowDownIcon className="size-4" />
        )}
      </div>
      <div className="flex flex-col min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <span className="text-[11px] sm:text-xs font-bold text-slate-550 dark:text-slate-400 tracking-wide">
            {label}
          </span>
          <span className="text-xs sm:text-sm font-extrabold text-slate-800 dark:text-slate-100 font-mono leading-tight">
            {formatSpeed(bytesPerSecond)}
          </span>
        </div>
        <div className="text-[10px] sm:text-[11px] text-slate-400 dark:text-slate-500 font-semibold font-mono mt-0.5">
          {formatTotal(totalBytes)}
        </div>
      </div>
    </div>
  )
}

export function UsagePanel() {
  const { isRunning } = useEngineState()
  const [uploadSpeed, setUploadSpeed] = useState(0)
  const [downloadSpeed, setDownloadSpeed] = useState(0)
  const [uploadTotal, setUploadTotal] = useState(0)
  const [downloadTotal, setDownloadTotal] = useState(0)
  const [history, setHistory] = useState<TrafficPoint[]>(
    Array.from({ length: 60 }, (_, i) => ({
      time: `${i}`,
      download: 0,
      upload: 0,
    }))
  )
  useEffect(() => {
    let active = true
    let controller: AbortController | null = null

    const startStreaming = async () => {
      if (!isRunning) return

      try {
        const secret = await getClashApiSecret()
        controller = new AbortController()
        const res = await fetch("http://127.0.0.1:9191/traffic", {
          headers: {
            Authorization: `Bearer ${secret}`,
          },
          signal: controller.signal,
        })

        if (!res.ok || !res.body) return

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        while (active) {
          const { value, done } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() || ""

          for (const line of lines) {
            if (line.trim()) {
              try {
                const data = JSON.parse(line)
                const up = Math.round(data.up ?? 0)
                const down = Math.round(data.down ?? 0)
                if (active) {
                  setUploadSpeed(up)
                  setDownloadSpeed(down)
                  setUploadTotal((prev) => prev + up)
                  setDownloadTotal((prev) => prev + down)
                  setHistory((prev) => {
                    const next = [...prev.slice(1), { time: "", download: down, upload: up }]
                    return next.map((p, i) => ({ ...p, time: `${i}` }))
                  })
                }
              } catch (e) {
                // Ignore parsing errors of partial lines
              }
            }
          }
        }
      } catch (e) {
        console.error("Traffic stream error:", e)
      }
    }

    if (isRunning) {
      startStreaming()
    } else {
      setUploadSpeed(0)
      setDownloadSpeed(0)
    }

    return () => {
      active = false
      if (controller) {
        controller.abort()
      }
    }
  }, [isRunning])

  return (
    <Card className="flex min-h-0 flex-1 flex-col rounded-[20px] shadow-sm">
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 pt-4 pb-4 px-4">
        <div className="flex shrink-0 gap-3">
          <StatBox
            type="upload"
            label="上传"
            bytesPerSecond={uploadSpeed}
            totalBytes={uploadTotal}
          />
          <StatBox
            type="download"
            label="下载"
            bytesPerSecond={downloadSpeed}
            totalBytes={downloadTotal}
          />
        </div>

        <ChartContainer
          config={chartConfig}
          className="aspect-auto w-full flex-1 min-h-0 [&_.recharts-legend-wrapper]:!static [&_.recharts-legend-wrapper]:!pt-2"
          initialDimension={{ width: 280, height: 72 }}
        >
          <LineChart
            data={history}
            margin={{ left: 0, right: 0, top: 5, bottom: 5 }}
          >
            <CartesianGrid
              vertical={false}
              strokeDasharray="3 3"
              stroke="#f1f5f9"
              className="dark:stroke-white/[0.06]"
            />
            <XAxis dataKey="time" hide />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Line
              type="monotone"
              dataKey="download"
              stroke="#3b59ff"
              strokeWidth={1.5}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="upload"
              stroke="#10b981"
              strokeWidth={1.5}
              dot={false}
              strokeDasharray="3 3"
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
