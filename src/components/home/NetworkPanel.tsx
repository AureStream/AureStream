import { useState, useEffect, useCallback } from "react"
import { RefreshCwIcon } from "lucide-react"
import { invoke } from "@tauri-apps/api/core"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { useEngineState } from "@/hooks/useEngineState"
import { type } from "@/lib/typography"

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

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={type.kvLabel}>{label}</span>
      <span className={mono ? type.kvValueMono : type.kvValue}>{value}</span>
    </div>
  )
}

export function NetworkPanel() {
  const { isRunning } = useEngineState()
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
    try {
      const info = await invoke<{
        ip: string
        countryName: string
        countryCode: string
        region: string
        isp: string
      }>("get_geoip_info", { useProxy: isRunning })
      setNetworkInfo({
        ip: info.ip || "未知",
        countryName: info.countryName || "未知",
        countryCode: info.countryCode || "UN",
        region: info.region || "未知",
        isp: info.isp || "未知",
      })
    } catch (e) {
      console.warn("get_geoip_info via Rust failed:", e)
      setNetworkInfo({
        ip: "未知 / 获取失败",
        countryName: "未知",
        countryCode: "UN",
        region: "未知",
        isp: "未知",
      })
    } finally {
      setRefreshing(false)
    }
  }, [isRunning])

  useEffect(() => {
    if (isRunning) {
      const timer = setTimeout(() => {
        refresh()
      }, 800)
      return () => clearTimeout(timer)
    } else {
      refresh()
    }
  }, [isRunning, refresh])

  useEffect(() => {
    const handleNodeChange = () => {
      refresh()
    }
    window.addEventListener("node-changed", handleNodeChange)
    return () => {
      window.removeEventListener("node-changed", handleNodeChange)
    }
  }, [refresh])

  return (
    <Card className="shrink-0 rounded-[20px] shadow-sm">
      <CardContent className="flex flex-col gap-0 py-4 px-4">
        <div className="flex items-center justify-between gap-4">
          <span className={type.kvLabel}>国家/地区</span>
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-sm leading-none shrink-0" role="img" aria-label="国旗">
                {getFlagEmojiByCode(networkInfo.countryCode)}
              </span>
              <span className={type.kvValue}>{networkInfo.countryName}</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label="刷新网络信息"
              onClick={refresh}
              disabled={refreshing}
            >
              <RefreshCwIcon className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        <Separator className="my-2.5 bg-border/60" />

        <InfoRow label="IP 地址" value={networkInfo.ip} mono />
        <Separator className="my-2.5 bg-border/60" />
        <InfoRow label="地理位置" value={networkInfo.region} />
        <Separator className="my-2.5 bg-border/60" />
        <InfoRow label="网络提供商" value={networkInfo.isp} />
      </CardContent>
    </Card>
  )
}
