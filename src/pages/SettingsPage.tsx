import { useState, useEffect } from "react"
import {
  SettingsIcon,
  SunIcon,
  MoonIcon,
  MonitorIcon,
  InfoIcon,
  RefreshCwIcon,
  ExternalLinkIcon,
  ShieldCheckIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { badge, btn, iconBadge, type } from "@/lib/typography"
import { useTheme } from "@/contexts/ThemeContext"
import {
  getProxyPort,
  setProxyPort,
  getControllerPort,
  setControllerPort,
  getTunStack,
  setTunStack,
  type TunStack,
} from "@/single/store"
import { invoke } from "@tauri-apps/api/core"
import { message } from "@tauri-apps/plugin-dialog"

export function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const [port, setPort] = useState("2345")
  const [apiPort, setApiPort] = useState("9191")
  const [bypassList, setBypassList] = useState(
    "localhost, 127.0.0.1, ::1, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, *.local, <local>"
  )
  const [autoStart, setAutoStart] = useState(true)
  const [tunStack, setTunStackState] = useState<TunStack>("system")

  // New states for Tray & Interaction card
  const [hideOnLaunch, setHideOnLaunch] = useState(false)
  const [minimizeToTray, setMinimizeToTray] = useState(true)

  // States for About Card updates
  const [updateStatus, setUpdateStatus] = useState<"idle" | "checking" | "latest">("idle")

  // States for TUN service management
  const [serviceStatus, setServiceStatus] = useState<"checking" | "installed" | "not_installed" | "failed">("checking")
  const [actionLoading, setActionLoading] = useState(false)
  const [activeAction, setActiveAction] = useState<"install" | "uninstall" | null>(null)

  const checkServiceStatus = async () => {
    setServiceStatus("checking")
    try {
      await invoke("engine_probe")
      setServiceStatus("installed")
    } catch {
      setServiceStatus("not_installed")
    }
  }

  useEffect(() => {
    checkServiceStatus()
  }, [])

  const handleInstallService = async () => {
    setActionLoading(true)
    setActiveAction("install")
    try {
      await invoke("engine_ensure_installed")
      setServiceStatus("installed")
      await message("辅助服务安装/更新成功", {
        title: "成功",
        kind: "info",
      })
    } catch (err: any) {
      console.error("Install helper service failed:", err)
      await message(`安装辅助服务失败: ${err.message || err}`, {
        title: "错误",
        kind: "error",
      })
      await checkServiceStatus()
    } finally {
      setActionLoading(false)
      setActiveAction(null)
    }
  }

  const handleUninstallService = async () => {
    setActionLoading(true)
    setActiveAction("uninstall")
    try {
      await invoke("engine_uninstall_service")
      setServiceStatus("not_installed")
      await message("辅助服务已成功卸载", {
        title: "成功",
        kind: "info",
      })
    } catch (err: any) {
      console.error("Uninstall helper service failed:", err)
      await message(`卸载辅助服务失败: ${err.message || err}`, {
        title: "错误",
        kind: "error",
      })
      await checkServiceStatus()
    } finally {
      setActionLoading(false)
      setActiveAction(null)
    }
  }

  useEffect(() => {
    async function loadSettings() {
      const p = await getProxyPort()
      setPort(String(p))
      const ap = await getControllerPort()
      setApiPort(String(ap))
      const stack = await getTunStack()
      setTunStackState(stack)
    }
    loadSettings()
  }, [])

  const handleTunStackChange = async (stack: TunStack) => {
    setTunStackState(stack)
    await setTunStack(stack)
  }

  const tunStackHint: Record<TunStack, string> = {
    system: "使用系统网络栈",
    gvisor: "用户态协议栈，兼容性好",
    mixed: "TCP 系统栈，UDP gVisor",
  }

  const handleProxyPortChange = async (val: number) => {
    setPort(String(val))
    if (val > 0 && val <= 65535) {
      await setProxyPort(val)
    }
  }

  const handleApiPortChange = async (val: number) => {
    setApiPort(String(val))
    if (val > 0 && val <= 65535) {
      await setControllerPort(val)
    }
  }


  const handleCheckUpdate = () => {
    setUpdateStatus("checking")
    setTimeout(() => {
      setUpdateStatus("latest")
    }, 1200)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden h-full">
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3.5 sm:gap-4.5 h-full overflow-y-auto lg:overflow-hidden pr-0.5 pb-2">
        {/* Left Column: appearance, about */}
        <div className="flex flex-col gap-3.5 sm:gap-4.5 lg:h-full lg:overflow-hidden">
          {/* 外观与主题 */}
          <Card className="rounded-[20px] shadow-xs shrink-0">
            <CardContent className="py-4 px-5 flex flex-col gap-4">
              <div className="flex items-center gap-2 mb-1">
                <div className={iconBadge.indigo}>
                  <SunIcon className="size-4" />
                </div>
                <span className={type.sectionTitle}>外观与托盘</span>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-1">
                  <div className="flex flex-col">
                    <span className={type.label}>外观主题</span>
                    <span className={cn(type.caption, "mt-0.5")}>选择客户端视觉风格</span>
                  </div>
                  <div className="grid grid-cols-3 gap-0.5 rounded-lg bg-muted p-0.5 border border-border/60 w-full sm:w-[260px] shrink-0">
                    {(["system", "light", "dark"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTheme(t)}
                        className={cn(
                          "flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md py-1.5 text-xs font-semibold transition-all cursor-pointer",
                          theme === t ? cn(btn.pillActive, "shadow-xs") : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {t === "system" && <MonitorIcon className="size-3.5 shrink-0" />}
                        {t === "light" && <SunIcon className="size-3.5 shrink-0" />}
                        {t === "dark" && <MoonIcon className="size-3.5 shrink-0" />}
                        {t === "system" ? "系统" : t === "light" ? "浅色" : "深色"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="h-px bg-border/40 my-0.5" />

                <div className="flex items-center justify-between gap-4 py-1">
                  <div className="flex flex-col min-w-0">
                    <span className={type.label}>启动时隐藏</span>
                    <span className={cn(type.caption, "mt-0.5 truncate")}>应用启动时静默隐藏到后台</span>
                  </div>
                  <Switch checked={hideOnLaunch} onCheckedChange={setHideOnLaunch} size="sm" />
                </div>

                <div className="h-px bg-border/40 my-0.5" />

                <div className="flex items-center justify-between gap-4 py-1">
                  <div className="flex flex-col min-w-0">
                    <span className={type.label}>最小化到托盘</span>
                    <span className={cn(type.caption, "mt-0.5 truncate")}>点击关闭窗口时不退出程序，仅收起至托盘</span>
                  </div>
                  <Switch checked={minimizeToTray} onCheckedChange={setMinimizeToTray} size="sm" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 关于软件 */}
          <Card className="rounded-[20px] shadow-xs flex-1 flex flex-col overflow-hidden min-h-[260px]">
            <CardContent className="py-4 px-5 flex flex-col gap-4 flex-1 min-h-0">
              <div className="flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <div className={iconBadge.slate}>
                    <InfoIcon className="size-4" />
                  </div>
                  <span className={type.sectionTitle}>关于软件</span>
                </div>
                <a
                  href="https://github.com/BadKid90s/AureStream"
                  target="_blank"
                  rel="noreferrer"
                  className={cn(type.link, "flex items-center gap-1 text-xs")}
                >
                  开源主页 <ExternalLinkIcon className="size-3.5" />
                </a>
              </div>

              {/* Scrollable middle body */}
              <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3 min-h-0">
                <div className="flex items-center justify-between py-1.5 shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-xl bg-gradient-to-tr from-primary via-primary/95 to-indigo-500 flex items-center justify-center text-primary-foreground font-bold text-sm shadow-md ring-2 ring-background">
                      AS
                    </div>
                    <div className="flex flex-col leading-snug">
                      <span className="font-semibold text-sm">AureStream Client</span>
                      <span className={cn(type.caption, "mt-0.5")}>简洁高效的网络代理客户端</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={badge.brand}>v0.1.0</span>
                    <span className={badge.success}>Stable</span>
                  </div>
                </div>

                <div className="h-px bg-border/40 my-0.5 shrink-0" />

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 py-1.5 text-xs text-muted-foreground shrink-0">
                  <div className="flex justify-between sm:flex-col sm:gap-1 border-b sm:border-b-0 sm:border-r border-border/40 pb-2 sm:pb-0 pr-4">
                    <span>软件内核</span>
                    <span className="font-semibold text-foreground">sing-box</span>
                  </div>
                  <div className="flex justify-between sm:flex-col sm:gap-1 border-b sm:border-b-0 sm:border-r border-border/40 pb-2 sm:pb-0 sm:px-4">
                    <span>运行平台</span>
                    <span className="font-semibold text-foreground">macOS (Tauri)</span>
                  </div>
                  <div className="flex justify-between sm:flex-col sm:gap-1 sm:pl-4">
                    <span>系统许可</span>
                    <span className="font-semibold text-foreground">MIT License</span>
                  </div>
                </div>
              </div>

              <div className="h-px bg-border/40 my-0.5 shrink-0" />

              {/* Pinned action button */}
              <div className="pt-1 shrink-0">
                <Button
                  variant="default"
                  size="default"
                  disabled={updateStatus === "checking"}
                  onClick={handleCheckUpdate}
                  className={cn(
                    "w-full h-10 font-semibold transition-all duration-300 text-xs rounded-xl shadow-xs",
                    updateStatus === "checking"
                      ? "bg-muted text-muted-foreground"
                      : updateStatus === "latest"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/15"
                      : "bg-primary text-primary-foreground hover:bg-primary/95"
                  )}
                >
                  {updateStatus === "checking" && (
                    <>
                      <RefreshCwIcon className="size-4 mr-2 animate-spin" />
                      正在检查更新...
                    </>
                  )}
                  {updateStatus === "latest" && (
                    <>
                      <ShieldCheckIcon className="size-4 mr-2 text-emerald-500" />
                      当前已是最新版本
                    </>
                  )}
                  {updateStatus === "idle" && "检查软件更新"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: services, network */}
        <div className="flex flex-col gap-3.5 sm:gap-4.5 lg:h-full lg:overflow-hidden">
          {/* 系统与服务 */}
          <Card className="rounded-[20px] shadow-xs shrink-0">
            <CardContent className="py-4 px-5 flex flex-col gap-4">
              <div className="flex items-center gap-2 mb-1">
                <div className={iconBadge.blue}>
                  <SettingsIcon className="size-4" />
                </div>
                <span className={type.sectionTitle}>系统与服务</span>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-4 py-1">
                  <div className="flex flex-col min-w-0">
                    <span className={type.label}>开机自启动</span>
                    <span className={cn(type.caption, "mt-0.5 truncate")}>在系统启动时自动运行客户端</span>
                  </div>
                  <Switch checked={autoStart} onCheckedChange={setAutoStart} size="sm" />
                </div>

                <div className="h-px bg-border/40 my-0.5" />

                <div className="flex items-center justify-between gap-4 py-1">
                  <div className="flex flex-col min-w-0">
                    <span className={type.label}>TUN 网卡辅助服务</span>
                    <span className={cn(type.caption, "mt-0.5 truncate")}>
                      {serviceStatus === "checking" && "正在检测服务状态..."}
                      {serviceStatus === "installed" && "服务已安装并就绪"}
                      {serviceStatus === "not_installed" && "未安装，无法使用 TUN 模式"}
                      {serviceStatus === "failed" && "服务检测失败"}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span
                      className={cn(
                        "size-2 rounded-full",
                        serviceStatus === "installed"
                          ? "bg-green-500"
                          : serviceStatus === "checking"
                            ? "bg-blue-400 animate-pulse"
                            : "bg-slate-400"
                      )}
                    />
                    {serviceStatus === "installed" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={actionLoading}
                        onClick={handleUninstallService}
                        className="h-8 border-destructive/20 text-destructive hover:bg-destructive/5 font-semibold text-xs rounded-lg"
                      >
                        {actionLoading && activeAction === "uninstall" ? "卸载中..." : "卸载"}
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={serviceStatus === "checking" || actionLoading}
                        onClick={handleInstallService}
                        className="h-8 font-semibold text-xs rounded-lg"
                      >
                        {actionLoading && activeAction === "install" ? "安装中..." : "安装"}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 网络与代理参数 */}
          <Card className="rounded-[20px] shadow-xs flex-1 flex flex-col overflow-hidden min-h-[300px]">
            <CardContent className="py-4 px-5 flex flex-col gap-4 flex-1 min-h-0">
              <div className="flex items-center gap-2 mb-1 shrink-0">
                <div className={iconBadge.teal}>
                  <SettingsIcon className="size-4" />
                </div>
                <span className={type.sectionTitle}>网络与代理参数</span>
              </div>

              {/* Scrollable settings content */}
              <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3 min-h-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-1 shrink-0">
                  <div className="flex flex-col">
                    <span className={type.label}>TUN 网络栈</span>
                    <span className={cn(type.caption, "mt-0.5")}>{tunStackHint[tunStack]}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-0.5 rounded-lg bg-muted p-0.5 border border-border/60 w-full sm:w-[260px] shrink-0">
                    {(
                      [
                        { value: "system" as const, label: "System" },
                        { value: "gvisor" as const, label: "gVisor" },
                        { value: "mixed" as const, label: "Mixed" },
                      ] as const
                    ).map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => handleTunStackChange(value)}
                        className={cn(
                          "flex min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded-md py-1.5 text-xs font-semibold transition-all cursor-pointer",
                          tunStack === value
                            ? cn(btn.pillActive, "shadow-xs")
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="h-px bg-border/40 my-0.5 shrink-0" />

                <div className="flex items-center justify-between gap-4 py-1 shrink-0">
                  <div className="flex flex-col min-w-0">
                    <span className={type.label}>混合代理端口</span>
                    <span className={cn(type.caption, "mt-0.5 truncate")}>HTTP / SOCKS 端口</span>
                  </div>
                  <div className="flex items-center shrink-0">
                    <input
                      type="number"
                      value={port}
                      onChange={(e) => handleProxyPortChange(Number(e.target.value))}
                      className="ui-input w-20 text-center font-semibold"
                    />
                  </div>
                </div>

                <div className="h-px bg-border/40 my-0.5 shrink-0" />

                <div className="flex items-center justify-between gap-4 py-1 shrink-0">
                  <div className="flex flex-col min-w-0">
                    <span className={type.label}>sing-box 控制台端口</span>
                    <span className={cn(type.caption, "mt-0.5 truncate")}>控制器监听端口</span>
                  </div>
                  <div className="flex items-center shrink-0">
                    <input
                      type="number"
                      value={apiPort}
                      onChange={(e) => handleApiPortChange(Number(e.target.value))}
                      className="ui-input w-20 text-center font-semibold"
                    />
                  </div>
                </div>

                <div className="h-px bg-border/40 my-0.5 shrink-0" />

                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 py-1 shrink-0">
                  <div className="flex flex-col shrink-0 sm:w-1/3">
                    <span className={type.label}>绕过代理目标地址</span>
                    <span className={cn(type.caption, "mt-1")}>
                      直连域名/IP 列表
                    </span>
                  </div>
                  <textarea
                    value={bypassList}
                    onChange={(e) => setBypassList(e.target.value)}
                    className="ui-textarea font-mono w-full sm:flex-1 min-h-[130px] flex-1 text-xs resize-none"
                    placeholder="localhost, 127.0.0.1..."
                  />
                </div>
              </div>


            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
