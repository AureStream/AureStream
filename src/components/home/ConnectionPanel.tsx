import { useState, useEffect, useRef, useCallback } from "react"
import { PowerIcon, GitForkIcon, CpuIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import { surface, type } from "@/lib/typography"
import { Card, CardContent } from "@/components/ui/card"
import {
  ensureEngineServiceInstalled,
  probeEngineServiceState,
  type EngineServiceState,
} from "@/lib/engine-probe"
import { syncActiveConnectionConfig } from "@/lib/config-sync"
import { connectEngine } from "@/lib/connection-flow"
import { useEngineState } from "@/hooks/useEngineState"
import { getEnableTun, setEnableTun, getStoreValue, setStoreValue } from "@/single/store"
import { useSubscriptions } from "@/hooks/useSubscriptions"
import { requireEngineIdle } from "@/lib/require-engine-idle"
import {
  ROUTING_MODE_KEY,
  normalizeRoutingMode,
  nextRoutingMode,
  type RoutingMode,
} from "@/lib/routing-mode"
import { message } from "@tauri-apps/plugin-dialog"

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":")
}

export function ConnectionPanel({ className }: { className?: string }) {
  const { t } = useTranslation()
  const { engineState, isConnected, isRunning, isStarting, isStopping, isFailed, stop, clearError } =
    useEngineState()
  const { activeIdentifier } = useSubscriptions()
  const [routingMode, setRoutingMode] = useState<RoutingMode>("rule")
  const [enableTun, setEnableTunState] = useState(false)
  const [uptime, setUptime] = useState(0)
  const uptimeRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [tunServiceState, setTunServiceState] = useState<
    EngineServiceState | "checking"
  >("checking")
  const [isInstallingService, setIsInstallingService] = useState(false)

  const engineBusy = isConnected || isStarting || isStopping

  const checkTunService = useCallback(async () => {
    setTunServiceState(await probeEngineServiceState())
  }, [])

  const handleInstallTunService = async () => {
    setIsInstallingService(true)
    try {
      await ensureEngineServiceInstalled()
      setTunServiceState("ready")
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error("Install helper service failed:", err)
      await message(`${t("install_service_failed")}: ${msg}`, {
        title: t("error"),
        kind: "error",
      })
    } finally {
      setIsInstallingService(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    Promise.all([
      getStoreValue(ROUTING_MODE_KEY, "rule"),
      getEnableTun(),
    ]).then(async ([val, tunEnabled]) => {
      const mode = normalizeRoutingMode(val)
      if (val === "direct") {
        await setStoreValue(ROUTING_MODE_KEY, mode)
      }
      if (cancelled) return
      setRoutingMode(mode)
      setEnableTunState(tunEnabled)
    }).catch((err) => {
      console.error("Failed to load connection settings:", err)
    })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (enableTun) {
      checkTunService()
    } else {
      setTunServiceState("checking")
    }
  }, [enableTun, checkTunService])

  const handleRoutingModeChange = async (mode: RoutingMode) => {
    setRoutingMode(mode)
    await setStoreValue(ROUTING_MODE_KEY, mode)
    try {
      await syncActiveConnectionConfig("routing-mode")
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error("Routing mode config sync failed:", err)
      await message(`${t("config_parse_merge_failed")}: ${msg}`, {
        title: t("error"),
        kind: "error",
      })
    }
  }

  const handleEnableTunChange = async (useTun: boolean) => {
    if (engineBusy) {
      if (!(await requireEngineIdle())) return
    }
    setEnableTunState(useTun)
    await setEnableTun(useTun)
    void syncActiveConnectionConfig("tun-mode").catch((err) => {
      console.error("TUN mode config sync failed:", err)
    })
    if (useTun) {
      void ensureEngineServiceInstalled()
        .then(() => setTunServiceState("ready"))
        .catch((err) => console.warn("[tun] pre-install helper failed:", err))
    }
  }

  const cycleRoutingMode = () => {
    const next = nextRoutingMode(routingMode)
    void handleRoutingModeChange(next)
  }

  const toggleCaptureMode = () => {
    void handleEnableTunChange(!enableTun)
  }

  useEffect(() => {
    if (engineState.kind === "running") {
      const runningSince = engineState.since
      const update = () =>
        setUptime(Math.max(0, Math.floor(Date.now() / 1000 - runningSince)))
      update()
      uptimeRef.current = setInterval(update, 1000)
      return () => {
        if (uptimeRef.current) clearInterval(uptimeRef.current)
      }
    } else if (engineState.kind === "stopping") {
      if (uptimeRef.current) clearInterval(uptimeRef.current)
    } else {
      setUptime(0)
      if (uptimeRef.current) clearInterval(uptimeRef.current)
    }
  }, [engineState.kind, "since" in engineState ? engineState.since : undefined])

  const handleToggle = async () => {
    if (isConnected || isStarting) {
      await stop()
    } else {
      if (!activeIdentifier) {
        await message(t("please_select_valid_subscription"), {
          title: t("hint"),
          kind: "warning",
        })
        return
      }
      if (isFailed) await clearError()
      const useTun = enableTun

      try {
        await connectEngine(activeIdentifier, routingMode, useTun)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error("Connect failed:", err)
        await message(`${t("config_parse_merge_failed")}: ${msg}`, {
          title: t("error"),
          kind: "error",
        })
        return
      }
    }
  }

  const statusText = isStarting
    ? t("connecting_status")
    : isFailed
    ? t("connection_failed")
    : isConnected
    ? t("secure_proxy_connected")
    : t("secure_proxy_disconnected")

  const statusColor = isFailed
    ? "bg-red-500"
    : isConnected
      ? "bg-green-500 animate-pulse"
      : "bg-slate-400"

  return (
    <Card className={cn("shrink-0 rounded-[20px] h-full", className)}>
      <CardContent className="flex flex-row items-center gap-6 p-4 sm:p-5 h-full">
        <div
          className={cn(
            "size-28 sm:size-32 shrink-0 rounded-full flex items-center justify-center transition-all duration-500 p-3.5 relative border",
            (isRunning && !isStopping)
              ? "border-blue-300/80 bg-blue-100/70 dark:border-blue-500/40 dark:bg-blue-950/45"
              : (isStarting || isStopping)
                ? "border-blue-100 bg-blue-50/20 dark:border-blue-500/10 dark:bg-blue-950/10"
                : isFailed
                  ? "border-red-200 bg-red-50/70 dark:border-red-500/30 dark:bg-red-950/30"
                  : "border-slate-200/50 bg-[#f8fafc]/50 dark:border-white/[0.06] dark:bg-white/[0.02]"
          )}
        >
          <button
            onClick={handleToggle}
            aria-pressed={isConnected}
            disabled={isStarting || isStopping}
            className={cn(
              "size-full rounded-full border border-slate-200 bg-white shadow-sm dark:border-white/[0.08] dark:bg-white/[0.04] flex flex-col items-center justify-center gap-1.5 transition-all duration-500 cursor-pointer select-none active:scale-95 active:brightness-95 hover:bg-slate-50 dark:hover:bg-white/[0.08]"
            )}
          >
            <div className="relative flex items-center justify-center size-8 sm:size-10">
              {(isStarting || isStopping) && (
                <div className="absolute inset-0 rounded-full border-2 border-blue-500/10 border-t-blue-500 animate-spin" />
              )}
              <PowerIcon
                className={cn(
                  "size-5 sm:size-6 transition-all duration-300",
                  (isConnected || isStarting || isStopping) && "scale-105",
                  isFailed
                    ? "text-red-600 dark:text-red-400"
                    : (isRunning && !isStopping)
                      ? "text-blue-600 dark:text-blue-400"
                      : (isStarting || isStopping)
                        ? "text-blue-500 dark:text-blue-400"
                        : "text-muted-foreground"
                )}
              />
            </div>
            <span
                className={cn(
                  "type-caption font-semibold tracking-wide transition-colors duration-300",
                  isFailed
                    ? "text-destructive"
                    : (isRunning && !isStopping)
                    ? "text-primary"
                    : (isStarting || isStopping)
                    ? "text-primary/80"
                    : "text-muted-foreground"
                )}
              >
                {isStarting ? t("connecting") : isStopping ? t("disconnecting") : isConnected ? t("connected") : isFailed ? t("failed") : t("not_connected")}
              </span>
          </button>
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-between h-full py-1 gap-2.5">
          <div className="flex justify-between items-center w-full px-0.5 border-b border-border/60 pb-2.5">
              <div className="flex flex-col gap-0.5">
                <span className={type.overline}>{t("service_status")}</span>
                <span
                  className={cn(
                    "flex items-center gap-1.5 type-value transition-colors duration-300",
                    isConnected && !isStopping
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-foreground"
                  )}
                >
                  <span className={cn("size-2 rounded-full", statusColor)} />
                  {statusText}
                </span>
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <span className={type.overline}>{t("connected_duration")}</span>
                <span
                  className={cn(
                    "font-mono type-value-lg transition-colors duration-300",
                    isConnected
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-foreground"
                  )}
                >
                  {formatUptime(uptime)}
                </span>
              </div>
            </div>

          <div className="flex flex-col gap-2 w-full">
            <div className="grid grid-cols-2 gap-2 w-full">
              <button
                onClick={cycleRoutingMode}
                disabled={isStarting || isStopping}
                className={cn(
                  surface.rowInteractive,
                  "flex items-center gap-2 p-2 text-left group",
                  (isStarting || isStopping) && "opacity-60 pointer-events-none"
                )}
              >
                <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:scale-105 transition-transform duration-300">
                  <GitForkIcon className="size-4" />
                </div>
                <div className="flex flex-col leading-tight min-w-0">
                  <span className={type.overline}>{t("routing_mode")}</span>
                  <span className={cn(type.value, "mt-0.5 truncate")}>
                    {t(`routing_mode_${routingMode}` as any)}
                  </span>
                </div>
              </button>

              <button
                onClick={toggleCaptureMode}
                disabled={isStarting || isStopping}
                className={cn(
                  surface.rowInteractive,
                  "flex items-center gap-2 p-2 text-left group",
                  (isStarting || isStopping) && "opacity-60 pointer-events-none"
                )}
              >
                <div
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-lg group-hover:scale-105 transition-transform duration-300",
                    enableTun
                      ? "bg-purple-500/10 text-purple-600 dark:text-purple-400"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  <CpuIcon className="size-4" />
                </div>
                <div className="flex flex-col leading-tight min-w-0">
                  <span className={type.overline}>{t("capture_mode")}</span>
                  <span className={cn(type.value, "mt-0.5 truncate")}>
                    {enableTun ? t("tun_nic") : t("system_proxy")}
                  </span>
                </div>
              </button>
            </div>

            <div className="transition-all duration-300 w-full px-0.5 min-h-[22px] flex items-center">
              {!enableTun ? (
                <div className="flex items-center gap-1.5 px-1 py-0.5 type-caption font-medium animate-in fade-in duration-200">
                  <span className="size-1.5 rounded-full bg-slate-400 dark:bg-slate-500" />
                  <span>{t("system_proxy_ready")}</span>
                </div>
              ) : (
                <div className="w-full">
                  {tunServiceState === "missing" && (
                    <div className="flex items-center justify-between rounded-lg border border-rose-200/50 bg-rose-50/50 px-2.5 py-1 dark:border-rose-500/20 dark:bg-rose-950/20 animate-in fade-in duration-200 w-full">
                      <span className="type-caption font-semibold text-destructive">{t("tun_service_not_installed")}</span>
                      <button
                        onClick={handleInstallTunService}
                        disabled={isInstallingService}
                        className={cn(type.link, "cursor-pointer disabled:opacity-50")}
                      >
                        {isInstallingService ? t("installing") : t("install_now")}
                      </button>
                    </div>
                  )}
                  {tunServiceState === "ready" && (
                    <div className="flex items-center gap-1.5 px-1 py-0.5 type-caption font-semibold text-emerald-600 dark:text-emerald-400 animate-in fade-in duration-200">
                      <span className="size-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
                      <span>{t("tun_service_ready")}</span>
                    </div>
                  )}
                  {tunServiceState === "unreachable" && (
                    <div className="flex items-center gap-1.5 rounded-lg border border-amber-200/50 bg-amber-50/50 px-2.5 py-1 dark:border-amber-500/20 dark:bg-amber-950/20 animate-in fade-in duration-200 w-full">
                      <span className="type-caption font-semibold text-amber-700 dark:text-amber-400">
                        {t("tun_service_unreachable")}
                      </span>
                    </div>
                  )}
                  {tunServiceState === "checking" && (
                    <span className={cn(type.caption, "animate-in fade-in duration-200")}>
                      {t("checking_service_status")}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
