import { RefreshCwIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

const rows = [
  { label: "IP 地址", value: "113.88.208.31", badge: "直连" },
  { label: "地理位置", value: "中国 · 广东 · 广州市" },
  { label: "网络提供商", value: "AS4134 · Chinanet" },
] as const

export function NetworkPanel() {
  return (
    <Card className="shrink-0 border border-slate-100 rounded-[20px] shadow-sm">
      <CardContent className="flex flex-col gap-0 py-3 px-4">
        {rows.map((row, index) => (
          <div key={row.label}>
            {index > 0 ? <Separator className="my-2 bg-slate-100" /> : null}
            <div className="flex items-center justify-between gap-4 text-xs font-semibold">
              <span className="text-slate-500 font-medium">{row.label}</span>
              <div className="flex items-center gap-2 min-w-0">
                <span className="truncate text-slate-800 font-bold">{row.value}</span>
                {"badge" in row ? (
                  <Badge variant="ghost" className="h-5 rounded-md bg-[#eef2ff] px-1.5 text-[10px] font-bold text-[#3b59ff] hover:bg-[#eef2ff]">
                    {row.badge}
                  </Badge>
                ) : null}
                {row.label === "IP 地址" && (
                  <Button variant="ghost" size="icon" className="size-5 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors" aria-label="刷新网络信息">
                    <RefreshCwIcon className="size-3" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
