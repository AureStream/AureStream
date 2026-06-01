import { useState, useEffect } from "react"
import {
  SettingsIcon,
  SunIcon,
  MoonIcon,
  MonitorIcon,
  InfoIcon,
  RefreshCwIcon,
  AppWindowIcon,
  ShieldIcon,
  ExternalLinkIcon,
  ShieldCheckIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { useTheme } from "@/contexts/ThemeContext"
import { getProxyPort, setProxyPort, getClashApiPort, setClashApiPort } from "@/single/store"

export function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const [port, setPort] = useState("2345")
  const [apiPort, setApiPort] = useState("9191")
  const [bypassList, setBypassList] = useState(
    "localhost, 127.0.0.1, ::1, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, *.local, <local>"
  )
  const [autoStart, setAutoStart] = useState(true)

  // New states for Tray & Interaction card
  const [hideOnLaunch, setHideOnLaunch] = useState(false)
  const [minimizeToTray, setMinimizeToTray] = useState(true)

  // States for DNS Settings card
  const [dnsMode, setDnsMode] = useState<"system" | "secure" | "custom">("system")
  const [dohProvider, setDohProvider] = useState<"ali" | "tencent" | "google">("ali")
  const [dnsServers, setDnsServers] = useState("223.5.5.5, 119.29.29.29")
  const [enableDnsCache, setEnableDnsCache] = useState(true)

  // States for About Card updates
  const [updateStatus, setUpdateStatus] = useState<"idle" | "checking" | "latest">("idle")

  useEffect(() => {
    async function loadSettings() {
      const p = await getProxyPort()
      setPort(String(p))
      const ap = await getClashApiPort()
      setApiPort(String(ap))
    }
    loadSettings()
  }, [])

  const handleProxyPortChange = async (val: number) => {
    setPort(String(val))
    if (val > 0 && val <= 65535) {
      await setProxyPort(val)
    }
  }

  const handleApiPortChange = async (val: number) => {
    setApiPort(String(val))
    if (val > 0 && val <= 65535) {
      await setClashApiPort(val)
    }
  }

  const handleCheckUpdate = () => {
    setUpdateStatus("checking")
    setTimeout(() => {
      setUpdateStatus("latest")
    }, 1200)
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.22fr)_minmax(0,0.78fr)] gap-3 sm:gap-5">
      {/* Left Column: Network, Service and Tray Settings */}
      <div className="flex min-h-0 flex-col gap-2.5 sm:gap-3 overflow-hidden">
        {/* Card 1: System and Services */}
        <Card className="shrink-0 rounded-[20px]">
          <CardContent className="flex flex-col gap-2 pt-3.5 pb-3 px-4">
            <div className="flex items-center gap-1.5 shrink-0 mb-1">
              <div className="flex size-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                <SettingsIcon className="size-4" />
              </div>
              <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">系统与服务设置</span>
            </div>

            {/* Auto Start Switch */}
            <div className="flex items-center justify-between rounded-[12px] border border-slate-200/60 bg-white/40 p-2.5 hover:bg-white/70 transition-all duration-200 dark:border-white/[0.06] dark:bg-white/[0.04] dark:hover:bg-white/[0.06]">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">开机自启动</span>
                <span className="text-[9px] text-slate-550 dark:text-slate-400 font-semibold mt-0.5">在系统启动时自动运行客户端</span>
              </div>
              <Switch checked={autoStart} onCheckedChange={setAutoStart} size="sm" />
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Tray & UI Interaction */}
        <Card className="shrink-0 rounded-[20px]">
          <CardContent className="flex flex-col gap-2 pt-3 pb-3 px-4">
            <div className="flex items-center gap-1.5 shrink-0 mb-1">
              <div className="flex size-7 items-center justify-center rounded-lg bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400">
                <AppWindowIcon className="size-4" />
              </div>
              <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">系统托盘与交互</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center justify-between rounded-[12px] border border-slate-200/60 bg-white/40 p-2.5 hover:bg-white/70 transition-all duration-200 dark:border-white/[0.06] dark:bg-white/[0.04] dark:hover:bg-white/[0.06]">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">启动时隐藏</span>
                  <span className="text-[8px] text-slate-500 dark:text-slate-400 font-semibold mt-0.5">静默后台启动</span>
                </div>
                <Switch checked={hideOnLaunch} onCheckedChange={setHideOnLaunch} size="sm" />
              </div>

              <div className="flex items-center justify-between rounded-[12px] border border-slate-200/60 bg-white/40 p-2.5 hover:bg-white/70 transition-all duration-200 dark:border-white/[0.06] dark:bg-white/[0.04] dark:hover:bg-white/[0.06]">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">最小化到托盘</span>
                  <span className="text-[8px] text-slate-500 dark:text-slate-400 font-semibold mt-0.5">关闭窗口不退出</span>
                </div>
                <Switch checked={minimizeToTray} onCheckedChange={setMinimizeToTray} size="sm" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Network Parameters */}
        <Card className="flex-1 min-h-0 rounded-[20px] overflow-hidden flex flex-col">
          <CardContent className="flex min-h-0 flex-1 flex-col gap-2 pt-3.5 pb-3 px-4 overflow-hidden">
            <div className="flex items-center gap-1.5 shrink-0 mb-1">
              <div className="flex size-7 items-center justify-center rounded-lg bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-400">
                <SettingsIcon className="size-4" />
              </div>
              <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">网络与代理参数</span>
            </div>

            {/* Proxy Port Setting */}
            <div className="flex items-center justify-between gap-4 rounded-[12px] border border-slate-200/60 bg-white/40 p-2.5 shrink-0 dark:border-white/[0.06] dark:bg-white/[0.04]">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">混合代理端口 (Mixed Port)</span>
                <span className="text-[9px] text-slate-550 dark:text-slate-400 font-semibold mt-0.5">本地统一 HTTP / SOCKS 监听端口</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <input
                  type="number"
                  value={port}
                  onChange={(e) => handleProxyPortChange(Number(e.target.value))}
                  className="w-16 h-6.5 rounded-md border border-slate-200 bg-white px-2 text-center text-xs font-bold text-slate-800 focus:border-[#007ACC] outline-none transition-all dark:border-white/[0.08] dark:bg-black dark:text-slate-200"
                />
                <Button
                  variant="ghost"
                  onClick={() => handleProxyPortChange(2345)}
                  className="h-6.5 px-2 rounded-md text-[9px] font-bold text-slate-500 hover:text-slate-700 transition-colors"
                >
                  重置
                </Button>
              </div>
            </div>

            {/* Clash API Port Setting */}
            <div className="flex items-center justify-between gap-4 rounded-[12px] border border-slate-200/60 bg-white/40 p-2.5 shrink-0 dark:border-white/[0.06] dark:bg-white/[0.04]">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">控制台 API 端口 (API Port)</span>
                <span className="text-[9px] text-slate-550 dark:text-slate-400 font-semibold mt-0.5">Clash 核心控制器接口监听端口</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <input
                  type="number"
                  value={apiPort}
                  onChange={(e) => handleApiPortChange(Number(e.target.value))}
                  className="w-16 h-6.5 rounded-md border border-slate-200 bg-white px-2 text-center text-xs font-bold text-slate-800 focus:border-[#007ACC] outline-none transition-all dark:border-white/[0.08] dark:bg-black dark:text-slate-200"
                />
                <Button
                  variant="ghost"
                  onClick={() => handleApiPortChange(9191)}
                  className="h-6.5 px-2 rounded-md text-[9px] font-bold text-slate-500 hover:text-slate-700 transition-colors"
                >
                  重置
                </Button>
              </div>
            </div>

            {/* Bypass Proxy List */}
            <div className="flex flex-col gap-1.5 rounded-[12px] border border-slate-200/60 bg-white/40 p-2.5 flex-1 min-h-0 dark:border-white/[0.06] dark:bg-white/[0.04]">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">绕过代理目标地址 (Bypass)</span>
                <span className="text-[9px] text-slate-550 dark:text-slate-400 font-semibold mt-0.5">列表内域名/IP直连</span>
              </div>
              <textarea
                value={bypassList}
                onChange={(e) => setBypassList(e.target.value)}
                className="flex-1 min-h-[45px] rounded-lg border border-slate-200 bg-white p-2 text-[10px] font-mono text-slate-700 placeholder-slate-400 focus:border-[#007ACC] outline-none transition-all resize-none dark:border-white/[0.08] dark:bg-black dark:text-slate-200"
                placeholder="localhost, 127.0.0.1, <local>..."
              />
              <span className="text-[8px] text-slate-500 dark:text-slate-400 font-medium">多个地址用逗号分割</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right Column: Theme selection, Routing Rules, and Version info */}
      <div className="flex min-h-0 flex-col gap-2.5 sm:gap-3 overflow-hidden">
        {/* Card 4: Theme select card */}
        <Card className="shrink-0 rounded-[20px]">
          <CardContent className="flex flex-col gap-2.5 py-3.5 px-4">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
                <SunIcon className="size-4" />
              </div>
              <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100">外观与主题</span>
            </div>

            <div className="flex rounded-lg bg-slate-100 dark:bg-white/[0.06] p-0.5 mt-1 border border-slate-150 dark:border-white/[0.1]">
              {(["system", "light", "dark"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={cn(
                    "flex-1 py-1.5 rounded-md text-[10px] font-bold transition-all cursor-pointer text-center flex items-center justify-center gap-1",
                    theme === t
                      ? "bg-white dark:bg-white/[0.1] text-[#3b59ff] dark:text-blue-400 shadow-sm border border-slate-100 dark:border-white/[0.12]"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  )}
                >
                  {t === "system" && (
                    <>
                      <MonitorIcon className="size-3" />
                      跟随系统
                    </>
                  )}
                  {t === "light" && (
                    <>
                      <SunIcon className="size-3" />
                      浅色
                    </>
                  )}
                  {t === "dark" && (
                    <>
                      <MoonIcon className="size-3" />
                      深色
                    </>
                  )}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Card 5: DNS & Secure Resolution Settings (Redesigned) */}
        <Card className="shrink-0 rounded-[20px]">
          <CardContent className="flex flex-col gap-2 pt-3 px-4 pb-3.5">
            <div className="flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                  <ShieldIcon className="size-4" />
                </div>
                <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">DNS 与安全解析</span>
              </div>
              <span className="text-[8.5px] text-slate-500 dark:text-slate-400 font-semibold">防止 DNS 劫持与泄露</span>
            </div>

            {/* Mode selection (pill style grid) */}
            <div className="grid grid-cols-3 gap-1.5 mt-1 shrink-0">
              {(["system", "secure", "custom"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setDnsMode(mode)}
                  className={cn(
                    "h-7 rounded-lg border text-[10px] font-bold transition-all cursor-pointer text-center",
                    dnsMode === mode
                      ? "border-[#007ACC] bg-[#eef2ff] text-[#007ACC] dark:bg-blue-500/15 dark:text-blue-400 dark:border-blue-500/40"
                      : "border-slate-200/60 bg-white/40 text-slate-500 hover:bg-slate-50 dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-slate-400 dark:hover:bg-white/[0.06]"
                  )}
                >
                  {mode === "system" && "系统默认"}
                  {mode === "secure" && "加密 DOH"}
                  {mode === "custom" && "自定义"}
                </button>
              ))}
            </div>

            {/* Row 1 of config slot */}
            <div className="h-10 mt-0.5 shrink-0">
              {dnsMode === "system" && (
                <div className="h-full flex items-center justify-between rounded-[12px] border border-slate-200/60 bg-white/40 px-2.5 text-[9px] text-slate-500 font-semibold animate-in fade-in duration-200 dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-slate-400">
                  <span>DNS 解析模式</span>
                  <span className="text-slate-600 font-bold dark:text-slate-300">直连系统默认 DNS</span>
                </div>
              )}

              {dnsMode === "secure" && (
                <div className="h-full flex items-center justify-between rounded-[12px] border border-slate-200/60 bg-white/40 px-2.5 animate-in fade-in duration-200 dark:border-white/[0.06] dark:bg-white/[0.04]">
                  <span className="text-[9px] text-slate-500 font-bold shrink-0 dark:text-slate-400">DOH 提供商</span>
                  <div className="flex rounded-md bg-slate-100 p-0.5 border border-slate-200/80 shrink-0 dark:bg-white/[0.06] dark:border-white/[0.1]">
                    {(["ali", "tencent", "google"] as const).map((prov) => (
                      <button
                        key={prov}
                        onClick={() => setDohProvider(prov)}
                        className={cn(
                          "px-2.5 py-0.5 rounded-md text-[8.5px] font-bold transition-all cursor-pointer text-center",
                          dohProvider === prov
                            ? "bg-white text-[#007ACC] shadow-xs dark:bg-white/[0.1] dark:text-blue-400"
                            : "text-slate-400 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                        )}
                      >
                        {prov === "ali" && "阿里"}
                        {prov === "tencent" && "腾讯"}
                        {prov === "google" && "Google"}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {dnsMode === "custom" && (
                <div className="h-full flex items-center gap-2 rounded-[12px] border border-slate-200/60 bg-white/40 px-2.5 animate-in fade-in duration-200 dark:border-white/[0.06] dark:bg-white/[0.04]">
                  <span className="text-[9px] text-slate-500 font-bold shrink-0 dark:text-slate-400">DNS 服务器</span>
                  <input
                    type="text"
                    value={dnsServers}
                    onChange={(e) => setDnsServers(e.target.value)}
                    placeholder="223.5.5.5, 119.29.29.29"
                    className="flex-1 h-6.5 rounded-md border border-slate-200 bg-white px-2 text-[10px] text-slate-800 focus:border-[#007ACC] outline-none transition-all font-mono dark:border-white/[0.08] dark:bg-black dark:text-slate-200"
                  />
                </div>
              )}
            </div>

            {/* Row 2 of config slot (Cache switch or placeholder tip) */}
            <div className="h-10 mt-0.5 shrink-0">
              {dnsMode !== "custom" ? (
                <div className="h-full flex items-center justify-between rounded-[12px] border border-slate-200/60 bg-white/40 px-2.5 hover:bg-white/70 transition-all duration-200 animate-in fade-in duration-200 dark:border-white/[0.06] dark:bg-white/[0.04] dark:hover:bg-white/[0.06]">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-slate-800 leading-none dark:text-slate-200">开启 DNS 缓存</span>
                    <span className="text-[8px] text-slate-500 dark:text-slate-400 font-semibold mt-1">减少解析延迟并防止 DNS 泄露</span>
                  </div>
                  <Switch checked={enableDnsCache} onCheckedChange={setEnableDnsCache} size="sm" />
                </div>
              ) : (
                <div className="h-full flex items-center justify-center rounded-[12px] border border-dashed border-slate-200 bg-[#f8fafc]/10 text-[8.5px] text-slate-400 font-semibold px-2 animate-in fade-in duration-200 dark:border-white/[0.08] dark:bg-white/[0.03]">
                  自定义 DNS 下将直接绕过本地缓存解析
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Card 6: About App Card (Redesigned) */}
        <Card className="flex-1 rounded-[20px] overflow-hidden">
          <CardContent className="flex flex-col gap-2.5 py-3 px-4 h-full">
            <div className="flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="flex size-7 items-center justify-center rounded-lg bg-slate-50 text-slate-500 border border-slate-100 dark:bg-white/[0.06] dark:text-slate-400 dark:border-white/[0.1]">
                  <InfoIcon className="size-4" />
                </div>
                <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">关于软件</span>
              </div>
              <a
                href="https://github.com/BadKid90s/AureStream"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-0.5 text-[8.5px] font-bold text-[#3b59ff] hover:underline"
              >
                开源主页 <ExternalLinkIcon className="size-2.5" />
              </a>
            </div>

            {/* Glowing AS Logo & Header Info Row */}
            <div className="flex items-center justify-between rounded-xl border border-slate-100/80 bg-gradient-to-r from-slate-50 to-[#f8fafc] p-2 mt-0.5 shrink-0 shadow-[0_2px_10px_rgba(0,0,0,0.01)] hover:border-slate-200/60 transition-all duration-350 dark:border-white/[0.08] dark:from-white/[0.06] dark:to-white/[0.04]">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="size-8 rounded-lg bg-gradient-to-tr from-[#3b59ff] via-[#4f46e5] to-[#6366f1] flex items-center justify-center text-white font-black text-[11px] shrink-0 shadow-sm shadow-blue-500/20 ring-2 ring-white">
                  AS
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] font-black text-slate-800 tracking-wide leading-none dark:text-slate-100">AureStream Client</span>
                  <div className="flex items-center gap-1.5 mt-1 leading-none">
                    <span className="text-[8px] text-[#3b59ff] font-extrabold bg-[#eef2ff] px-1 py-0.5 rounded border border-blue-100/50 dark:bg-blue-950/40 dark:text-blue-400 dark:border-white/[0.08]">
                      v0.1.0
                    </span>
                    <span className="size-1 rounded-full bg-slate-300 dark:bg-white/[0.1]" />
                    <span className="text-[8px] text-emerald-600 bg-emerald-50 px-1 py-0.5 rounded border border-emerald-100/50 font-extrabold dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/30">
                      Stable
                    </span>
                  </div>
                </div>
              </div>

              {/* Update status micro badge */}
              <div className="flex items-center gap-1 text-[8.5px] text-emerald-600 font-bold shrink-0">
                <ShieldCheckIcon className="size-3.5 text-emerald-500" />
                <span className="hidden sm:inline">最新版</span>
              </div>
            </div>

            {/* Detail Rows */}
            <div className="text-[9px] text-slate-400 leading-relaxed font-semibold flex flex-col gap-1.5 mt-0.5 shrink-0 dark:text-slate-500">
              <div className="flex justify-between">
                <span>软件内核</span>
                <span className="text-slate-600 font-bold dark:text-slate-300">Clash Meta (Mihomo)</span>
              </div>
              <div className="flex justify-between">
                <span>运行平台</span>
                <span className="text-slate-600 font-bold dark:text-slate-300">macOS (Tauri)</span>
              </div>
              <div className="flex justify-between">
                <span>系统许可</span>
                <span className="text-slate-600 font-bold dark:text-slate-300">MIT License</span>
              </div>
            </div>

            {/* Update Checker Action Button */}
            <div className="mt-auto pt-2 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                disabled={updateStatus === "checking"}
                onClick={handleCheckUpdate}
                className={cn(
                  "w-full h-7.5 rounded-lg text-[9.5px] font-bold transition-all duration-300 cursor-pointer shadow-sm shadow-blue-500/5",
                  updateStatus === "checking"
                    ? "bg-slate-50 text-slate-400 border border-slate-100 dark:bg-white/[0.04] dark:border-white/[0.08] dark:text-slate-500"
                    : updateStatus === "latest"
                    ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-100/60 border border-emerald-100/20 dark:bg-emerald-950/30 dark:text-emerald-400 dark:hover:bg-emerald-950/50 dark:border-emerald-900/30"
                    : "bg-[#eef2ff] text-[#3b59ff] hover:bg-blue-100/60 border border-blue-100/20 dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20 dark:border-blue-950/30"
                )}
              >
                {updateStatus === "checking" && (
                  <>
                    <RefreshCwIcon className="size-3.5 mr-1.5 animate-spin" />
                    正在检查更新...
                  </>
                )}
                {updateStatus === "latest" && (
                  <>
                    <ShieldCheckIcon className="size-3.5 mr-1.5 text-emerald-500" />
                    当前已是最新版本
                  </>
                )}
                {updateStatus === "idle" && "检查软件更新"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
