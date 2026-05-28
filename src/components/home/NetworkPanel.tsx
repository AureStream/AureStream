import { RefreshCwIcon } from "lucide-react"
import { CN } from "country-flag-icons/react/1x1"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

export function NetworkPanel() {
  return (
    <Card className="shrink-0 border border-slate-100 dark:border-white/[0.08] rounded-[20px] shadow-sm">
      <CardContent className="flex flex-col gap-0 py-4 px-4">
        {/* Country Row with Refresh Button */}
        <div className="flex items-center justify-between gap-4 text-xs font-semibold">
          <span className="text-slate-500 font-medium">国家/地区</span>
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center gap-1.5">
              {/* China Flag Icon */}
              <CN className="h-4 shrink-0" />
              <Badge variant="ghost" className="h-5 rounded-md bg-[#eef2ff] px-1.5 text-[10px] font-bold text-[#3b59ff] hover:bg-[#eef2ff] dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/10">
                中国
              </Badge>
            </div>
            <Button variant="ghost" size="icon" className="size-5 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-white/[0.08] dark:hover:text-slate-300 transition-colors" aria-label="刷新网络信息">
              <RefreshCwIcon className="size-3" />
            </Button>
          </div>
        </div>

        <Separator className="my-2.5 bg-slate-100 dark:bg-white/[0.08]" />

        {/* IP Address Row */}
        <div className="flex items-center justify-between gap-4 text-xs font-semibold">
          <span className="text-slate-500 font-medium">IP 地址</span>
          <span className="truncate text-slate-800 dark:text-slate-200 font-bold">113.88.208.31</span>
        </div>

        <Separator className="my-2.5 bg-slate-100 dark:bg-white/[0.08]" />

        {/* Location Row */}
        <div className="flex items-center justify-between gap-4 text-xs font-semibold">
          <span className="text-slate-500 font-medium">地理位置</span>
          <span className="truncate text-slate-800 dark:text-slate-200 font-bold">广东 · 广州市</span>
        </div>

        <Separator className="my-2.5 bg-slate-100 dark:bg-white/[0.08]" />

        {/* ISP Row */}
        <div className="flex items-center justify-between gap-4 text-xs font-semibold">
          <span className="text-slate-500 font-medium">网络提供商</span>
          <span className="truncate text-slate-800 dark:text-slate-200 font-bold">AS4134 · Chinanet</span>
        </div>
      </CardContent>
    </Card>
  )
}
