import { useState, useEffect, useCallback } from "react"
import { RefreshCwIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

interface GeoIpInfo {
  ip: string
  countryName: string
  countryCode: string
  region: string
  isp: string
}

function getFlagEmojiByCode(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return "🌐"
  const codePoints = countryCode
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0))
  try {
    return String.fromCodePoint(...codePoints)
  } catch {
    return "🌐"
  }
}

export function NetworkPanel() {
  const [networkInfo, setNetworkInfo] = useState<GeoIpInfo>({
    ip: "获取中...",
    countryName: "获取中...",
    countryCode: "UN",
    region: "获取中...",
    isp: "获取中...",
  })
  const [refreshing, setRefreshing] = useState(false)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    // Try ip-api.com (Chinese localization)
    try {
      const res = await fetch("http://ip-api.com/json?lang=zh-CN")
      if (res.ok) {
        const data = await res.json()
        if (data.status === "success") {
          const locStr = [data.country, data.city].filter(Boolean).join(" · ")
          setNetworkInfo({
            ip: data.query || "未知",
            countryName: data.country || "未知",
            countryCode: data.countryCode || "UN",
            region: locStr || "未知",
            isp: data.isp || "未知",
          })
          setRefreshing(false)
          return
        }
      }
    } catch (e) {
      console.warn("ip-api.com failed, trying fallback:", e)
    }

    // Try fallback: ipapi.co (HTTPS)
    try {
      const res = await fetch("https://ipapi.co/json/", { referrerPolicy: "no-referrer" })
      if (res.ok) {
        const data = await res.json()
        if (data.ip) {
          const locStr = [data.country_name, data.city].filter(Boolean).join(" · ")
          setNetworkInfo({
            ip: data.ip,
            countryName: data.country_name || "未知",
            countryCode: data.country_code || "UN",
            region: locStr || "未知",
            isp: data.org || "未知",
          })
          setRefreshing(false)
          return
        }
      }
    } catch (e) {
      console.warn("ipapi.co failed, trying fallback:", e)
    }

    // Try fallback 2: ipinfo.io
    try {
      const res = await fetch("https://ipinfo.io/json")
      if (res.ok) {
        const data = await res.json()
        const locStr = [data.country, data.city].filter(Boolean).join(" · ")
        setNetworkInfo({
          ip: data.ip || "未知",
          countryName: data.country || "未知",
          countryCode: data.country || "UN",
          region: locStr || "未知",
          isp: data.org || "未知",
        })
        setRefreshing(false)
        return
      }
    } catch (e) {
      console.warn("ipinfo.io fallback failed:", e)
    }

    setNetworkInfo({
      ip: "未知 / 获取失败",
      countryName: "未知",
      countryCode: "UN",
      region: "未知",
      isp: "未知",
    })
    setRefreshing(false)
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
              <span className="text-sm leading-none shrink-0" role="img" aria-label="国旗">
                {getFlagEmojiByCode(networkInfo.countryCode)}
              </span>
              <span className="truncate text-slate-800 dark:text-slate-200 font-bold">
                {networkInfo.countryName}
              </span>
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
            {networkInfo.ip}
          </span>
        </div>

        <Separator className="my-2.5 bg-slate-100 dark:bg-white/[0.08]" />

        <div className="flex items-center justify-between gap-4 text-xs font-semibold">
          <span className="text-slate-500 font-medium">地理位置</span>
          <span className="truncate text-slate-800 dark:text-slate-200 font-bold">
            {networkInfo.region}
          </span>
        </div>

        <Separator className="my-2.5 bg-slate-100 dark:bg-white/[0.08]" />

        <div className="flex items-center justify-between gap-4 text-xs font-semibold">
          <span className="text-slate-500 font-medium">网络提供商</span>
          <span className="truncate text-slate-800 dark:text-slate-200 font-bold">
            {networkInfo.isp}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
