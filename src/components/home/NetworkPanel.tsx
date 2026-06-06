import { useState, useEffect, useCallback, useRef } from "react"
import { RefreshCwIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import { invoke } from "@tauri-apps/api/core"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { useEngineState } from "@/hooks/useEngineState"
import { CountryFlag } from "@/components/ui/country-flag"
import { getCountryCode } from "@/lib/country-flags"
import { type } from "@/lib/typography"

interface GeoIpInfo {
  ip: string
  countryName: string
  countryCode: string
  region: string
  isp: string
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
  const { t } = useTranslation()
  const { isRunning, engineState } = useEngineState()
  const [networkInfo, setNetworkInfo] = useState<GeoIpInfo>({
    ip: t("loading"),
    countryName: t("loading"),
    countryCode: "UN",
    region: t("loading"),
    isp: t("loading"),
  })
  const [refreshing, setRefreshing] = useState(false)
  const refreshSeq = useRef(0)

  const refresh = useCallback(async () => {
    if (document.visibilityState === "hidden") {
      return
    }
    const seq = refreshSeq.current + 1
    refreshSeq.current = seq
    setRefreshing(true)
    try {
      const info = await invoke<{
        ip: string
        countryName: string
        countryCode: string
        region: string
        isp: string
      }>("get_geoip_info", { useProxy: isRunning })
      if (seq !== refreshSeq.current) return
      setNetworkInfo({
        ip: info.ip || t("unknown"),
        countryName: info.countryName || t("unknown"),
        countryCode: info.countryCode || "UN",
        region: info.region || t("unknown"),
        isp: info.isp || t("unknown"),
      })
    } catch (e) {
      if (seq !== refreshSeq.current) return
      console.warn("get_geoip_info via Rust failed:", e)
      setNetworkInfo({
        ip: t("unknown_or_fetch_failed"),
        countryName: t("unknown"),
        countryCode: "UN",
        region: t("unknown"),
        isp: t("unknown"),
      })
    } finally {
      if (seq === refreshSeq.current) {
        setRefreshing(false)
      }
    }
  }, [isRunning, t])

  useEffect(() => {
    if (engineState.kind === "running") {
      const timer = setTimeout(() => {
        refresh()
      }, 500)
      return () => clearTimeout(timer)
    } else if (engineState.kind === "idle") {
      // Delay fetch slightly to allow OS network routes/proxy settings to fully settle after disconnecting
      const timer = setTimeout(() => {
        refresh()
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [engineState.kind, refresh])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const handleNodeChange = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(refresh, 600)
    }
    window.addEventListener("node-changed", handleNodeChange)
    return () => {
      if (timer) clearTimeout(timer)
      window.removeEventListener("node-changed", handleNodeChange)
    }
  }, [refresh])

  return (
    <Card className="shrink-0 rounded-[20px] shadow-sm">
      <CardContent className="flex flex-col gap-0 py-4 px-4">
        <div className="flex items-center justify-between gap-4">
          <span className={type.kvLabel}>{t("country_region")}</span>
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className="relative flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/20 bg-background"
                role="img"
                aria-label={t("flag")}
              >
                <CountryFlag
                  code={
                    getCountryCode(networkInfo.countryCode) ||
                    getCountryCode(networkInfo.countryName)
                  }
                  title={t("flag")}
                />
              </span>
              <span className={type.kvValue}>{networkInfo.countryName}</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label={t("refresh_network_info")}
              onClick={refresh}
              disabled={refreshing}
            >
              <RefreshCwIcon className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        <Separator className="my-2.5 bg-border/60" />

        <InfoRow label={t("ip_address")} value={networkInfo.ip} mono />
        <Separator className="my-2.5 bg-border/60" />
        <InfoRow label={t("location")} value={networkInfo.region} />
        <Separator className="my-2.5 bg-border/60" />
        <InfoRow label={t("isp")} value={networkInfo.isp} />
      </CardContent>
    </Card>
  )
}
