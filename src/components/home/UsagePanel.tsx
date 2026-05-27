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

export function UsagePanel() {
  return (
    <Card className="flex min-h-0 flex-1 flex-col border border-slate-100 rounded-[20px] shadow-sm">
      <CardContent className="flex min-h-0 flex-1 flex-col gap-2 pt-3 pb-3 px-4">
        {/* Unified Horizontal Double-sided Stat Card */}
        <div className="flex items-center justify-between rounded-[14px] border border-slate-100 bg-[#f8fafc]/30 p-2 shrink-0">
          {/* Upload */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-500">
              <ArrowUpIcon className="size-3.5" />
            </div>
            <div className="flex-1 min-w-0 flex flex-col">
              <span className="text-[10px] font-bold text-slate-500 leading-none">上传</span>
              <span className="text-xs font-extrabold text-slate-800 mt-1 truncate">0 B/s</span>
              <span className="text-[9px] text-slate-400 font-semibold mt-0.5 truncate">累计 0 B</span>
            </div>
          </div>

          {/* Vertical Divider */}
          <div className="h-8 w-px bg-slate-200/80 mx-2 shrink-0" />

          {/* Download */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-500">
              <ArrowDownIcon className="size-3.5" />
            </div>
            <div className="flex-1 min-w-0 flex flex-col">
              <span className="text-[10px] font-bold text-slate-500 leading-none">下载</span>
              <span className="text-xs font-extrabold text-slate-800 mt-1 truncate">0 B/s</span>
              <span className="text-[9px] text-slate-400 font-semibold mt-0.5 truncate">累计 0 B</span>
            </div>
          </div>
        </div>

        <ChartContainer
          config={chartConfig}
          className="aspect-auto w-full flex-1 min-h-[100px] sm:min-h-[120px] [&_.recharts-legend-wrapper]:!static [&_.recharts-legend-wrapper]:!pt-1"
          initialDimension={{ width: 280, height: 100 }}
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
