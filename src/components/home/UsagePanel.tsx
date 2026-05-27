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

function StatBox({
  label,
  speed,
  total,
  type,
}: {
  label: string
  speed: string
  total: string
  type: "upload" | "download"
}) {
  const isUpload = type === "upload"
  return (
    <div className="flex items-center justify-between gap-3 rounded-[14px] border border-slate-100 bg-[#f8fafc]/30 px-3 py-2.5 flex-1 min-w-0">
      <div className="flex items-center gap-2 shrink-0">
        <div
          className={`flex size-7 items-center justify-center rounded-lg ${
            isUpload ? "bg-emerald-50 text-emerald-500" : "bg-blue-50 text-blue-500"
          }`}
        >
          {isUpload ? <ArrowUpIcon className="size-3.5" /> : <ArrowDownIcon className="size-3.5" />}
        </div>
        <span className="text-xs font-bold text-slate-600">{label}</span>
      </div>
      <div className="flex flex-col items-end min-w-0">
        <div className="text-sm font-extrabold text-slate-800 leading-tight">{speed}</div>
        <div className="text-[9px] text-slate-400 font-semibold mt-0.5">{total}</div>
      </div>
    </div>
  )
}

export function UsagePanel() {
  return (
    <Card className="flex min-h-0 flex-1 flex-col border border-slate-100 rounded-[20px] shadow-sm">
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 pt-4 pb-4 px-4">
        <div className="flex shrink-0 gap-3">
          <StatBox type="upload" label="上传" speed="0 B/s" total="累计 0 B" />
          <StatBox type="download" label="下载" speed="0 B/s" total="累计 0 B" />
        </div>

        <ChartContainer
          config={chartConfig}
          className="aspect-auto w-full flex-1 min-h-0 [&_.recharts-legend-wrapper]:!static [&_.recharts-legend-wrapper]:!pt-2"
          initialDimension={{ width: 280, height: 72 }}
        >
          <LineChart data={trafficHistory} margin={{ left: 0, right: 0, top: 5, bottom: 5 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#f1f5f9" />
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
