import { ArrowDownIcon, ArrowUpIcon } from "lucide-react"
import { CartesianGrid, Line, LineChart, XAxis } from "recharts"

import { trafficHistory } from "@/data/mock"
import {
  Card,
  CardContent,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

const chartConfig = {
  download: {
    label: "下载",
    color: "#3b59ff",
  },
  upload: {
    label: "上传",
    color: "#10b981",
  },
} satisfies ChartConfig

// 格式化速度，小于 1 KB 显示 0 KB/s
function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond < 1024) {
    return "0 KB/s"
  }
  const kb = bytesPerSecond / 1024
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB/s`
  }
  const mb = kb / 1024
  if (mb < 1024) {
    return `${mb.toFixed(1)} MB/s`
  }
  const gb = mb / 1024
  return `${gb.toFixed(1)} GB/s`
}

// 格式化总流量
function formatTotal(bytes: number): string {
  if (bytes === 0) return "累计 0 B"
  if (bytes < 1024) return `累计 ${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `累计 ${kb.toFixed(1)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `累计 ${mb.toFixed(1)} MB`
  const gb = kb / 1024
  if (gb < 1024) return `累计 ${gb.toFixed(1)} GB`
  const tb = gb / 1024
  return `累计 ${tb.toFixed(1)} TB`
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
  const speed = formatSpeed(bytesPerSecond)
  const total = formatTotal(totalBytes)

  return (
    <div className="flex items-center gap-3 rounded-[14px] border border-slate-100 dark:border-white/[0.08] bg-[#f8fafc]/30 dark:bg-white/[0.04] px-3 py-2.5 flex-1 min-w-0">
      <div
        className={`flex size-8 items-center justify-center rounded-lg shrink-0 ${
          isUpload ? "bg-emerald-50 text-emerald-500 dark:bg-emerald-500/10 dark:text-emerald-400" : "bg-blue-50 text-blue-500 dark:bg-blue-500/10 dark:text-blue-400"
        }`}
      >
        {isUpload ? <ArrowUpIcon className="size-4" /> : <ArrowDownIcon className="size-4" />}
      </div>
      <div className="flex flex-col min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">{label}</span>
          <span className="text-[11px] font-extrabold text-slate-800 dark:text-slate-200 leading-tight">{speed}</span>
        </div>
        <div className="text-[9px] text-slate-400 dark:text-slate-500 font-semibold mt-0.5">{total}</div>
      </div>
    </div>
  )
}

export function UsagePanel() {
  return (
    <Card className="flex min-h-0 flex-1 flex-col border border-slate-100 dark:border-white/[0.08] rounded-[20px] shadow-sm">
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 pt-4 pb-4 px-4">
        <div className="flex shrink-0 gap-3">
          <StatBox type="upload" label="上传" bytesPerSecond={0} totalBytes={0} />
          <StatBox type="download" label="下载" bytesPerSecond={0} totalBytes={0} />
        </div>

        <ChartContainer
          config={chartConfig}
          className="aspect-auto w-full flex-1 min-h-0 [&_.recharts-legend-wrapper]:!static [&_.recharts-legend-wrapper]:!pt-2"
          initialDimension={{ width: 280, height: 72 }}
        >
          <LineChart data={trafficHistory} margin={{ left: 0, right: 0, top: 5, bottom: 5 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#f1f5f9" className="dark:stroke-white/[0.06]" />
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
