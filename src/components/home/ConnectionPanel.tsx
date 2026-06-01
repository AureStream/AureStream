import { useState, useEffect, useRef, useCallback } from "react"
import { PowerIcon, GitForkIcon, CpuIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { invoke } from "@tauri-apps/api/core"
import { useEngineState } from "@/hooks/useEngineState"
import { getEnableTun, setEnableTun, getStoreValue, setStoreValue } from "@/single/store"
import { useSubscriptions } from "@/hooks/useSubscriptions"
import setGlobalTunConfig, {
  setTunConfig,
  setMixedConfig,
  setGlobalMixedConfig,
} from "@/config/merger/main"
import { message } from "@tauri-apps/plugin-dialog"

const ROUTING_MODE_KEY = "routing_mode"

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":")
}

export function ConnectionPanel({ className }: { className?: string }) {
  const { engineState, isConnected, isRunning, isStarting, isStopping, isFailed, start, stop, clearError } =
    useEngineState()
  const { activeIdentifier } = useSubscriptions()
  const [routingMode, setRoutingMode] = useState<"rule" | "global" | "direct">("rule")
  const [enableTun, setEnableTunState] = useState(false)
  const [uptime, setUptime] = useState(0)
  const uptimeRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [isTunServiceInstalled, setIsTunServiceInstalled] = useState<boolean | null>(null)
  const [isInstallingService, setIsInstallingService] = useState(false)

  const checkTunService = useCallback(async () => {
    try {
      await invoke("engine_probe")
      setIsTunServiceInstalled(true)
    } catch {
      setIsTunServiceInstalled(false)
    }
  }, [])

  const handleInstallTunService = async () => {
    setIsInstallingService(true)
    try {
      await invoke("engine_ensure_installed")
      setIsTunServiceInstalled(true)
    } catch (err: any) {
      console.error("Install helper service failed:", err)
      await message(`安装辅助服务失败: ${err.message || err}`, {
        title: "错误",
        kind: "error",
      })
    } finally {
      setIsInstallingService(false)
    }
  };

  // Load routing mode and TUN setting from store
  useEffect(() => {
    getStoreValue(ROUTING_MODE_KEY, "rule").then((val) => {
      setRoutingMode(val)
    })
    getEnableTun().then((val) => {
      setEnableTunState(val)
    })
    checkTunService()
  }, [checkTunService])

  const handleRoutingModeChange = async (mode: "rule" | "global" | "direct") => {
    setRoutingMode(mode)
    await setStoreValue(ROUTING_MODE_KEY, mode)
  }

  const handleEnableTunChange = async (useTun: boolean) => {
    setEnableTunState(useTun)
    await setEnableTun(useTun)
  }

  const cycleRoutingMode = () => {
    const modes: ("rule" | "global" | "direct")[] = ["rule", "global", "direct"]
    const nextIndex = (modes.indexOf(routingMode) + 1) % modes.length
    handleRoutingModeChange(modes[nextIndex])
  }

  const toggleCaptureMode = () => {
    handleEnableTunChange(!enableTun)
  }

  const since =
    engineState.kind === "running" || engineState.kind === "starting"
      ? engineState.since
      : null

  useEffect(() => {
    if (since !== null) {
      const update = () =>
        setUptime(Math.max(0, Math.floor(Date.now() / 1000 - since)))
      update()
      uptimeRef.current = setInterval(update, 1000)
      return () => {
        if (uptimeRef.current) clearInterval(uptimeRef.current)
      }
    } else {
      setUptime(0)
      if (uptimeRef.current) clearInterval(uptimeRef.current)
    }
  }, [since])

  const handleToggle = async () => {
    if (isConnected || isStarting) {
      await stop()
    } else {
      if (!activeIdentifier) {
        await message("请先在订阅页面添加并选择一个有效的订阅", {
          title: "提示",
          kind: "warning",
        })
        return
      }
      if (isFailed) await clearError()
      const useTun = enableTun

      try {
        const isGlobal = routingMode === "global"
        if (useTun) {
          const fn = isGlobal ? setGlobalTunConfig : setTunConfig
          await fn(activeIdentifier)
        } else {
          const fn = isGlobal ? setGlobalMixedConfig : setMixedConfig
          await fn(activeIdentifier)
        }
      } catch (err: any) {
        console.error("Config merge failed:", err)
        await message(`配置解析合并失败: ${err.message || err}`, {
          title: "错误",
          kind: "error",
        })
        return
      }

      const configDir = await invoke<Record<string, string>>("get_app_paths").then(
        (p) => p.config_dir
      ).catch(() => "")
      const configPath = `${configDir}/config.json`
      const mode = useTun ? "IntoProxy" : "SystemProxy"
      await start(configPath, mode)
    }
  }

  const statusText = isStarting
    ? "正在连接..."
    : isFailed
      ? "连接失败"
      : isConnected
        ? "安全代理已连接"
        : "安全代理已断开"

  const statusColor = isFailed
    ? "bg-red-500"
    : isConnected
      ? "bg-green-500 animate-pulse"
      : "bg-slate-400"

  return (
    <Card className={cn("shrink-0 rounded-[20px] h-full", className)}>
      <CardContent className="flex flex-row items-center gap-6 p-4 sm:p-5 h-full">
        {/* Left: Power Button */}
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
                        : "text-slate-500 dark:text-slate-400"
                )}
              />
            </div>
            <span className={cn(
              "text-[10px] sm:text-[11px] font-extrabold tracking-wider transition-colors duration-300",
              isFailed
                ? "text-red-600 dark:text-red-400"
                : (isRunning && !isStopping)
                  ? "text-blue-600 dark:text-blue-400"
                  : (isStarting || isStopping)
                    ? "text-blue-500 dark:text-blue-400"
                    : "text-slate-500 dark:text-slate-400"
            )}>
              {isStarting ? "连接中" : isStopping ? "断开中" : isConnected ? "已连接" : isFailed ? "失败" : "未连接"}
            </span>
          </button>
        </div>

        {/* Right: Info and Selectors */}
        <div className="flex min-w-0 flex-1 flex-col justify-between h-full py-1 gap-2.5">
          {/* Uptime and Status */}
          <div className="flex justify-between items-center w-full px-0.5 border-b border-slate-100 dark:border-white/[0.05] pb-2.5">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-muted-foreground font-bold tracking-wider uppercase">
                服务状态
              </span>
              <span className={cn(
                "flex items-center gap-1.5 text-xs sm:text-sm font-extrabold transition-colors duration-300",
                (isConnected && !isStopping)
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-slate-800 dark:text-slate-100"
              )}>
                <span className={cn("size-2 rounded-full", statusColor)} />
                {statusText}
              </span>
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-[10px] text-muted-foreground font-bold tracking-wider uppercase">
                已连接时长
              </span>
              <span className={cn(
                "font-mono text-sm sm:text-base font-extrabold tracking-wider transition-colors duration-300",
                isConnected
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-slate-700 dark:text-slate-200"
              )}>
                {formatUptime(uptime)}
              </span>
            </div>
          </div>

          {/* Premium Selectors */}
          <div className="flex flex-col gap-2 w-full">
            <div className="grid grid-cols-2 gap-2 w-full">
              {/* Routing Card */}
              <button
                onClick={cycleRoutingMode}
                className="flex items-center gap-2 p-2 rounded-xl border border-slate-200/50 bg-[#f8fafc]/50 hover:bg-slate-50 transition-all duration-300 dark:border-white/[0.06] dark:bg-white/[0.02] dark:hover:bg-white/[0.04] text-left cursor-pointer group"
              >
                <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400 group-hover:scale-105 transition-transform duration-300">
                  <GitForkIcon className="size-4" />
                </div>
                <div className="flex flex-col leading-tight min-w-0">
                  <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                    路由模式
                  </span>
                  <span className="text-xs font-extrabold text-slate-800 dark:text-slate-100 mt-0.5 truncate">
                    {routingMode === "rule" && "规则分流"}
                    {routingMode === "global" && "全局代理"}
                    {routingMode === "direct" && "直接连接"}
                  </span>
                </div>
              </button>

              {/* Capture Card */}
              <button
                onClick={toggleCaptureMode}
                className="flex items-center gap-2 p-2 rounded-xl border border-slate-200/50 bg-[#f8fafc]/50 hover:bg-slate-50 transition-all duration-300 dark:border-white/[0.06] dark:bg-white/[0.02] dark:hover:bg-white/[0.04] text-left cursor-pointer group"
              >
                <div className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-lg group-hover:scale-105 transition-transform duration-300",
                  enableTun
                    ? "bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400"
                    : "bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-slate-400"
                )}>
                  <CpuIcon className="size-4" />
                </div>
                <div className="flex flex-col leading-tight min-w-0">
                  <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                    接管模式
                  </span>
                  <span className="text-xs font-extrabold text-slate-800 dark:text-slate-100 mt-0.5 truncate">
                    {enableTun ? "Tun网卡" : "系统代理"}
                  </span>
                </div>
              </button>
            </div>

            <div className="transition-all duration-300 w-full px-0.5 min-h-[22px] flex items-center">
              {!enableTun ? (
                <div className="flex items-center gap-1.5 px-1 py-0.5 text-[9.5px] text-slate-450 dark:text-slate-500 font-extrabold animate-in fade-in duration-200">
                  <span className="size-1.5 rounded-full bg-slate-400 dark:bg-slate-500" />
                  <span>系统代理模式已就绪</span>
                </div>
              ) : (
                <div className="w-full">
                  {isTunServiceInstalled === false && (
                    <div className="flex items-center justify-between rounded-lg border border-rose-200/50 bg-rose-50/50 px-2.5 py-1 dark:border-rose-500/20 dark:bg-rose-950/20 animate-in fade-in duration-200 w-full">
                      <span className="text-[9.5px] font-bold text-rose-600 dark:text-rose-400">未安装网卡服务</span>
                      <button
                        onClick={handleInstallTunService}
                        disabled={isInstallingService}
                        className="text-[9.5px] font-extrabold text-blue-600 hover:text-blue-700 dark:text-blue-400 cursor-pointer disabled:opacity-50 hover:underline"
                      >
                        {isInstallingService ? "安装中..." : "立即安装"}
                      </button>
                    </div>
                  )}
                  {isTunServiceInstalled === true && (
                    <div className="flex items-center gap-1.5 px-1 py-0.5 text-[9.5px] text-emerald-600 dark:text-emerald-400 font-extrabold animate-in fade-in duration-200">
                      <span className="size-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
                      <span>网卡服务已就绪</span>
                    </div>
                  )}
                  {isTunServiceInstalled === null && (
                    <span className="text-[9.5px] text-slate-400 dark:text-slate-500 font-bold animate-in fade-in duration-200">
                      正在检测服务状态...
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
