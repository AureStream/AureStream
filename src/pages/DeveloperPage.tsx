import { useState, useEffect } from "react"
import { invoke } from "@tauri-apps/api/core"
import {
  CpuIcon,
  ToggleLeftIcon,
  CodeIcon,
  Settings2Icon,
  HelpCircleIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import {
  getStoreValue,
  setStoreValue,
  isBypassRouterEnabled,
  setBypassRouterEnabled,
  getSkipSystemProxy,
  setSkipSystemProxy,
  getUseDHCP,
  setUseDHCP,
} from "@/single/store"
import {
  STAGE_VERSION_STORE_KEY,
  TUN_STACK_STORE_KEY,
} from "@/types/definition"

export function DeveloperPage() {
  const [stageVersion, setStageVersion] = useState<"stable" | "dev">("stable")
  const [tunStack, setTunStack] = useState<"gvisor" | "mixed" | "system">("gvisor")
  const [bypassRouter, setBypassRouter] = useState(false)
  const [skipSystemProxy, setSkipSystemProxyState] = useState(false)
  const [useDHCP, setUseDHCPState] = useState(false)
  const [watchdogEnabled, setWatchdogEnabled] = useState(true)

  useEffect(() => {
    async function loadDevSettings() {
      const stage = await getStoreValue(STAGE_VERSION_STORE_KEY, "stable")
      const stack = await getStoreValue(TUN_STACK_STORE_KEY, "gvisor")
      const bypass = await isBypassRouterEnabled()
      const skipProxy = await getSkipSystemProxy()
      const dhcp = await getUseDHCP()
      const watchdog = await getStoreValue("watchdog_enabled", true)

      setStageVersion(stage)
      setTunStack(stack)
      setBypassRouter(bypass)
      setSkipSystemProxyState(skipProxy)
      setUseDHCPState(dhcp)
      setWatchdogEnabled(watchdog)
    }
    loadDevSettings()
  }, [])

  const handleStageChange = async (val: "stable" | "dev") => {
    setStageVersion(val)
    await setStoreValue(STAGE_VERSION_STORE_KEY, val)
  }

  const handleTunStackChange = async (val: "gvisor" | "mixed" | "system") => {
    setTunStack(val)
    await setStoreValue(TUN_STACK_STORE_KEY, val)
  }

  const handleBypassChange = async (checked: boolean) => {
    setBypassRouter(checked)
    await setBypassRouterEnabled(checked)
  }

  const handleSkipProxyChange = async (checked: boolean) => {
    setSkipSystemProxyState(checked)
    await setSkipSystemProxy(checked)
  }

  const handleDHCPChange = async (checked: boolean) => {
    setUseDHCPState(checked)
    await setUseDHCP(checked)
  }

  const handleWatchdogChange = async (checked: boolean) => {
    setWatchdogEnabled(checked)
    await setStoreValue("watchdog_enabled", checked)
  }

  const handleOpenDevTools = async () => {
    try {
      await invoke("open_devtools")
    } catch (err) {
      console.error("Failed to open DevTools:", err)
    }
  }

  const handleKillOrphans = async () => {
    try {
      await invoke("kill_orphans")
      alert("孤立进程清理指令已发送")
    } catch (err) {
      console.error("Failed to kill orphans:", err)
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0 w-full gap-3 sm:gap-4 overflow-y-auto pr-1">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-xl bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400">
            <CpuIcon className="size-4.5" />
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-black text-slate-800 dark:text-slate-100">开发者与高级面板</h1>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">调整内核网络协议栈、更新渠道版本与辅助诊断工具</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1.22fr)_minmax(0,0.78fr)] gap-3 sm:gap-5">
        {/* Left Column: Network and Kernel Tuning */}
        <div className="flex flex-col gap-3">
          {/* Card 1: Core switches */}
          <Card className="rounded-[20px] border border-slate-200/60 dark:border-white/[0.08]">
            <CardContent className="flex flex-col gap-3 p-4">
              <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200 text-xs">
                <Settings2Icon className="size-4 text-orange-500" />
                <span>高级网络接管调优</span>
              </div>

              {/* Bypass LAN Router */}
              <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-white/40 p-2.5 dark:border-white/[0.06] dark:bg-white/[0.04]">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">绕过局域网路由器分流 (Bypass Router)</span>
                  <span className="text-[11px] text-slate-550 dark:text-slate-400 font-medium mt-0.5">直接跳过网关，优化本地设备互联延迟</span>
                </div>
                <Switch checked={bypassRouter} onCheckedChange={handleBypassChange} size="sm" />
              </div>

              {/* Skip System Proxy */}
              <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-white/40 p-2.5 dark:border-white/[0.06] dark:bg-white/[0.04]">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">跳过系统代理钩子 (Skip System Proxy)</span>
                  <span className="text-[11px] text-slate-550 dark:text-slate-400 font-medium mt-0.5">部分命令行或服务不应用系统环境变量代理</span>
                </div>
                <Switch checked={skipSystemProxy} onCheckedChange={handleSkipProxyChange} size="sm" />
              </div>

              {/* DHCP Client */}
              <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-white/40 p-2.5 dark:border-white/[0.06] dark:bg-white/[0.04]">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">启用虚拟 DHCP 服务</span>
                  <span className="text-[11px] text-slate-550 dark:text-slate-400 font-medium mt-0.5">在 TUN 网卡下分配 DHCP 以防网络栈冲突</span>
                </div>
                <Switch checked={useDHCP} onCheckedChange={handleDHCPChange} size="sm" />
              </div>

              {/* Watchdog Switch */}
              <div className="flex items-center justify-between rounded-xl border border-slate-150 bg-white/40 p-2.5 dark:border-white/[0.06] dark:bg-white/[0.04]">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">启用 1Hz 状态机守护看门狗</span>
                  <span className="text-[11px] text-slate-550 dark:text-slate-400 font-medium mt-0.5">每秒轮询 sing-box 侧车服务存活并防闪退崩溃</span>
                </div>
                <Switch checked={watchdogEnabled} onCheckedChange={handleWatchdogChange} size="sm" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Protocols, Release Version & Diagnostics */}
        <div className="flex flex-col gap-3">
          {/* Card 2: TUN Stack Select */}
          <Card className="rounded-[20px] border border-slate-200/60 dark:border-white/[0.08]">
            <CardContent className="flex flex-col gap-2.5 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">TUN 协议栈选择</span>
                <HelpCircleIcon className="size-3.5 text-slate-400" />
              </div>

              <div className="grid grid-cols-3 gap-1 bg-slate-100 dark:bg-white/[0.06] p-0.5 rounded-lg border border-slate-200/50 dark:border-white/[0.06]">
                {(["gvisor", "mixed", "system"] as const).map(stack => (
                  <button
                    key={stack}
                    onClick={() => handleTunStackChange(stack)}
                    className={`py-1 rounded-md text-[11px] font-bold cursor-pointer transition-all ${
                      tunStack === stack
                        ? "bg-white dark:bg-white/[0.1] text-orange-600 dark:text-orange-400 shadow-sm"
                        : "text-slate-500 dark:text-slate-400 hover:text-slate-700"
                    }`}
                  >
                    {stack === "gvisor" ? "gVisor" : stack === "mixed" ? "混合式" : "系统级"}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Card 3: Release Stage */}
          <Card className="rounded-[20px] border border-slate-200/60 dark:border-white/[0.08]">
            <CardContent className="flex flex-col gap-2.5 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">更新渠道版本</span>
                <span className="text-[10px] bg-slate-100 text-slate-650 px-1 py-0.5 rounded font-extrabold dark:bg-white/[0.06]">Channels</span>
              </div>

              <div className="flex rounded-lg bg-slate-100 dark:bg-white/[0.06] p-0.5 border border-slate-250 dark:border-white/[0.1]">
                {(["stable", "dev"] as const).map(stage => (
                  <button
                    key={stage}
                    onClick={() => handleStageChange(stage)}
                    className={`flex-1 py-1 rounded-md text-[11px] font-bold cursor-pointer transition-all text-center ${
                      stageVersion === stage
                        ? "bg-white dark:bg-white/[0.1] text-[#3b59ff] dark:text-blue-400 shadow-sm"
                        : "text-slate-500 dark:text-slate-400 hover:text-slate-700"
                    }`}
                  >
                    {stage === "stable" ? "正式版" : "开发者版"}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Card 4: Developer Diagnostics */}
          <Card className="rounded-[20px] border border-slate-200/60 dark:border-white/[0.08]">
            <CardContent className="flex flex-col gap-2.5 p-4">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">开发者辅助诊断</span>

              <div className="flex flex-col gap-2">
                <Button
                  onClick={handleOpenDevTools}
                  className="w-full h-8 rounded-lg bg-slate-100 hover:bg-slate-200/60 dark:bg-white/[0.05] dark:hover:bg-white/[0.08] text-slate-850 dark:text-slate-200 font-bold text-[11px] cursor-pointer border border-slate-200/30 transition-all"
                >
                  <CodeIcon className="size-3.5 mr-1 text-[#3b59ff]" />
                  打开开发者工具 (Web DevTools)
                </Button>

                <Button
                  onClick={handleKillOrphans}
                  className="w-full h-8 rounded-lg bg-slate-100 hover:bg-slate-200/60 dark:bg-white/[0.05] dark:hover:bg-white/[0.08] text-slate-850 dark:text-slate-200 font-bold text-[11px] cursor-pointer border border-slate-200/30 transition-all"
                >
                  <ToggleLeftIcon className="size-3.5 mr-1 text-rose-500" />
                  强杀孤立子进程 (Kill Orphans)
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
