import { useState, useEffect, useCallback } from "react"
import { RefreshCwIcon } from "lucide-react"
import { CN } from "country-flag-icons/react/1x1"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { getLanIp } from "@/utils/vpn-service"

export function NetworkPanel() {
  const [lanIp, setLanIp] = useState<string>("获取中...")
  const [refreshing, setRefreshing] = useState(false)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const ip = await getLanIp()
      setLanIp(ip || "未知")
    } catch {
      setLanIp("获取失败")
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <Card className="shrink-0 rounded-[20px] shadow-sm">
      <CardContent className="flex flex-col gap-0 py-4 px-4">
        <div className="flex items-center justify-between gap-4 text-xs font-semibold">
          <span className="text-slate-500 font-medium">国家/地区</span>
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center gap-1.5">
              <CN className="h-4 shrink-0" />
              <Badge
                variant="ghost"
                className="h-5 rounded-md bg-[#eef2ff] px-1.5 text-[10px] font-bold text-[#3b59ff] hover:bg-[#eef2ff] dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/10"
              >
                中国
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-5 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-white/[0.08] dark:hover:text-slate-300 transition-colors"
              aria-label="刷新网络信息"
              onClick={refresh}
              disabled={refreshing}
            >
              <RefreshCwIcon
                className={`size-3 ${refreshing ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        </div>

        <Separator className="my-2.5 bg-slate-100 dark:bg-white/[0.08]" />

        <div className="flex items-center justify-between gap-4 text-xs font-semibold">
          <span className="text-slate-500 font-medium">IP 地址</span>
          <span className="truncate text-slate-800 dark:text-slate-200 font-bold font-mono">
            {lanIp}
          </span>
        </div>

        <Separator className="my-2.5 bg-slate-100 dark:bg-white/[0.08]" />

        <div className="flex items-center justify-between gap-4 text-xs font-semibold">
          <span className="text-slate-500 font-medium">地理位置</span>
          <span className="truncate text-slate-800 dark:text-slate-200 font-bold">
            待查询
          </span>
        </div>

        <Separator className="my-2.5 bg-slate-100 dark:bg-white/[0.08]" />

        <div className="flex items-center justify-between gap-4 text-xs font-semibold">
          <span className="text-slate-500 font-medium">网络提供商</span>
          <span className="truncate text-slate-800 dark:text-slate-200 font-bold">
            待查询
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
