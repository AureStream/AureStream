import { useState, useEffect, useRef } from "react"
import {
  CircleHelpIcon,
  CompassIcon,
  PowerIcon,
  ShieldIcon,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { invoke } from "@tauri-apps/api/core"
import { useEngineState } from "@/hooks/useEngineState"
import { getEnableTun, getStoreValue, setStoreValue } from "@/single/store"
import { useSubscriptions } from "@/hooks/useSubscriptions"
import setGlobalTunConfig, {
  setTunConfig,
  setMixedConfig,
  setGlobalMixedConfig,
} from "@/config/merger/main"
import { message } from "@tauri-apps/plugin-dialog"

const ROUTING_MODE_KEY = "routing_mode"

function ToggleRow({
  icon: Icon,
  label,
  help,
  checked,
  onCheckedChange,
  highlighted,
}: {
  icon: LucideIcon
  label: string
  help: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  highlighted?: boolean
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-[14px] px-3.5 py-2.5 transition-all duration-200",
        highlighted
          ? "border border-[#e2e8f0] bg-[#eef2ff]/50 hover:bg-[#eef2ff] dark:border-white/[0.08] dark:bg-blue-500/10 dark:hover:bg-blue-500/20"
          : "border border-[#e2e8f0] bg-[#f8fafc]/30 hover:bg-[#f8fafc]/60 dark:border-white/[0.06] dark:bg-white/[0.04] dark:hover:bg-white/[0.06]"
      )}
    >
      <div className="flex items-center gap-2">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#eef2ff] text-[#3b59ff] dark:bg-blue-500/15 dark:text-blue-400">
          <Icon className="size-4" />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            {label}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="size-5 text-muted-foreground hover:bg-transparent"
                aria-label={help}
              >
                <CircleHelpIcon className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{help}</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <Switch size="sm" checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":")
}

export function ConnectionPanel({ className }: { className?: string }) {
  const { engineState, isConnected, isStarting, isFailed, start, stop, clearError } =
    useEngineState()
  const { activeIdentifier } = useSubscriptions()
  const [routingMode, setRoutingMode] = useState<"rule" | "global" | "direct">("rule")
  const [adBlock, setAdBlock] = useState(false)
  const [uptime, setUptime] = useState(0)
  const uptimeRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load routing mode from store
  useEffect(() => {
    getStoreValue(ROUTING_MODE_KEY, "rule").then((val) => {
      setRoutingMode(val)
    })
  }, [])

  const handleRoutingModeChange = async (mode: "rule" | "global" | "direct") => {
    setRoutingMode(mode)
    await setStoreValue(ROUTING_MODE_KEY, mode)
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
      const useTun = await getEnableTun()

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
      <CardContent className="flex flex-row items-center gap-4 p-3 sm:p-4 h-full">
        <div
          className={cn(
            "h-[85%] aspect-square shrink-0 rounded-full flex items-center justify-center transition-all duration-300 p-4",
            isConnected
              ? "border border-blue-200/80 bg-blue-50/50 shadow-[0_0_15px_rgba(59,89,255,0.08)] dark:border-blue-500/25 dark:bg-blue-950/20 dark:shadow-[0_0_20px_rgba(59,89,255,0.15)]"
              : "border border-slate-200/50 bg-[#f8fafc]/50 dark:border-white/[0.06] dark:bg-white/[0.02]"
          )}
        >
          <button
            onClick={handleToggle}
            aria-pressed={isConnected}
            disabled={isStarting}
            className={cn(
              "size-full rounded-full border flex flex-col items-center justify-center gap-1 transition-all duration-300 cursor-pointer select-none",
              isConnected
                ? "border-transparent bg-gradient-to-tr from-[#254eff] to-[#4d73ff] text-white shadow-[0_4px_16px_rgba(59,89,255,0.25)] hover:brightness-105 dark:from-[#1d3cbd] dark:to-[#3b59ff] dark:text-white dark:shadow-[0_4px_20px_rgba(59,89,255,0.35)] dark:hover:brightness-110"
                : isFailed
                  ? "border-red-200 bg-red-50 text-red-500 hover:bg-red-100 shadow-sm dark:border-red-500/20 dark:bg-red-950/20 dark:text-red-400"
                  : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-600 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-400 dark:hover:bg-white/[0.08] dark:hover:text-slate-300"
            )}
          >
            <PowerIcon
              className={cn(
                "size-5 sm:size-6 transition-transform duration-300",
                (isConnected || isStarting) && "scale-110",
                isStarting && "animate-spin"
              )}
            />
            <span className="text-[9px] sm:text-[10px] font-semibold tracking-wide">
              {isStarting ? "连接中" : isConnected ? "已连接" : "未连接"}
            </span>
          </button>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex justify-between items-start w-full px-0.5">
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] text-muted-foreground font-medium">
                服务状态
              </span>
              <span className="flex items-center gap-1 text-[11px] font-bold text-slate-800 dark:text-slate-200">
                <span className={cn("size-1.5 rounded-full", statusColor)} />
                {statusText}
              </span>
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-[9px] text-muted-foreground font-medium">
                已连接时长
              </span>
              <span className="font-mono text-[13px] font-bold text-slate-600 tracking-wider dark:text-slate-300">
                {formatUptime(uptime)}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 pt-0.5">
            <div
              className={cn(
                "flex items-center justify-between rounded-[14px] px-3.5 py-2 transition-all duration-200 border border-[#e2e8f0] bg-[#f8fafc]/30 hover:bg-[#f8fafc]/60 dark:border-white/[0.06] dark:bg-white/[0.04] dark:hover:bg-white/[0.06]"
              )}
            >
              <div className="flex items-center gap-2">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#eef2ff] text-[#3b59ff] dark:bg-blue-500/15 dark:text-blue-400">
                  <CompassIcon className="size-4" />
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    路由模式
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="size-5 text-muted-foreground hover:bg-transparent"
                        aria-label="路由分流模式"
                      >
                        <CircleHelpIcon className="size-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      规则: 按规则分流；全局: 代理所有流量；直连: 直接连接不代理
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>

              <div className="flex rounded-lg bg-slate-100 p-0.5 border border-slate-150 shrink-0 dark:bg-white/[0.06] dark:border-white/[0.1]">
                {(["rule", "global", "direct"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => handleRoutingModeChange(mode)}
                    className={cn(
                      "px-2.5 py-0.5 rounded-md text-[10px] font-bold transition-all cursor-pointer text-center",
                      routingMode === mode
                        ? "bg-white text-[#3b59ff] shadow-xs dark:bg-white/[0.1] dark:text-blue-400"
                        : "text-slate-500 hover:text-slate-800 dark:text-white/60 dark:hover:text-slate-200"
                    )}
                  >
                    {mode === "rule" && "规则"}
                    {mode === "global" && "全局"}
                    {mode === "direct" && "直连"}
                  </button>
                ))}
              </div>
            </div>

            <ToggleRow
              icon={ShieldIcon}
              label="去广告"
              help="拦截常见广告与追踪域名"
              checked={adBlock}
              onCheckedChange={setAdBlock}
              highlighted={true}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
