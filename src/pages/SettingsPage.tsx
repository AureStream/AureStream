import { useState, useEffect, useRef } from "react"
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
import { useTranslation } from "react-i18next"

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
  getProxyBypass,
  setProxyBypass,
  getTunStack,
  setTunStack,
  type TunStack,
  getAutoStart,
  setAutoStartStore,
  getHideOnLaunch,
  setHideOnLaunchStore,
  getMinimizeToTray,
  setMinimizeToTrayStore,
} from "@/single/store"
import { invoke } from "@tauri-apps/api/core"
import { enable, disable } from "@tauri-apps/plugin-autostart"
import { message } from "@tauri-apps/plugin-dialog"
import { BYPASS_PLACEHOLDER, DEFAULT_PROXY_BYPASS_UI, normalizeBypassInput } from "@/lib/proxy-bypass"
import { getEngineState } from "@/utils/vpn-service"
import { isEngineBusy } from "@/lib/engine-guard"

export function SettingsPage() {
  const { t } = useTranslation()
  const { theme, setTheme } = useTheme()
  const [port, setPort] = useState("2345")
  const [apiPort, setApiPort] = useState("9191")
  const [bypassList, setBypassList] = useState(DEFAULT_PROXY_BYPASS_UI)
  const [savedBypass, setSavedBypass] = useState(DEFAULT_PROXY_BYPASS_UI)
  const initialPortsRef = useRef<{ mixed: number; controller: number } | null>(null)
  const [autoStart, setAutoStart] = useState(true)
  const [appVersion, setAppVersion] = useState("0.2.1")
  const [tunStack, setTunStackState] = useState<TunStack>("system")

  // New states for Tray & Interaction card
  const [hideOnLaunch, setHideOnLaunch] = useState(false)
  const [minimizeToTray, setMinimizeToTray] = useState(true)

  // Port input refs for debounce
  const proxyPortTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const apiPortTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // Cleanup debounce timers on unmount
  useEffect(() => {
    return () => {
      proxyPortTimer.current && clearTimeout(proxyPortTimer.current)
      apiPortTimer.current && clearTimeout(apiPortTimer.current)
    }
  }, [])

  const handleInstallService = async () => {
    setActionLoading(true)
    setActiveAction("install")
    try {
      await invoke("engine_ensure_installed")
      setServiceStatus("installed")
      await message(t("service_install_success"), {
        title: t("success"),
        kind: "info",
      })
    } catch (err: any) {
      console.error("Install helper service failed:", err)
      await message(`${t("install_service_failed")}: ${err.message || err}`, {
        title: t("error"),
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
      await message(t("service_uninstall_success"), {
        title: t("success"),
        kind: "info",
      })
    } catch (err: any) {
      console.error("Uninstall helper service failed:", err)
      await message(`${t("uninstall_service_failed")}: ${err.message || err}`, {
        title: t("error"),
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
      initialPortsRef.current = { mixed: p, controller: ap }
      const stack = await getTunStack()
      setTunStackState(stack)
      const bypass = await getProxyBypass()
      const display = bypass || DEFAULT_PROXY_BYPASS_UI
      setBypassList(display)
      setSavedBypass(display)

      // Load new settings
      setAutoStart(await getAutoStart())
      setHideOnLaunch(await getHideOnLaunch())
      setMinimizeToTray(await getMinimizeToTray())

      // Load version from backend
      try {
        setAppVersion(await invoke<string>("get_app_version"))
      } catch {
        setAppVersion("0.2.1")
      }
    }
    loadSettings()
  }, [])

  const handleAutoStartChange = async (checked: boolean) => {
    setAutoStart(checked)
    try {
      await setAutoStartStore(checked)
      if (checked) {
        await enable()
      } else {
        await disable()
      }
    } catch (e) {
      console.error("Failed to toggle autostart:", e)
      setAutoStart(!checked)
    }
  }

  const handleHideOnLaunchChange = async (checked: boolean) => {
    setHideOnLaunch(checked)
    try {
      await setHideOnLaunchStore(checked)
    } catch (e) {
      console.error("Failed to toggle hide on launch:", e)
      setHideOnLaunch(!checked)
    }
  }

  const handleMinimizeToTrayChange = async (checked: boolean) => {
    setMinimizeToTray(checked)
    try {
      await setMinimizeToTrayStore(checked)
    } catch (e) {
      console.error("Failed to toggle minimize to tray:", e)
      setMinimizeToTray(!checked)
    }
  }

  const warnIfEngineRunningForNetworkChange = async () => {
    const state = await getEngineState()
    if (isEngineBusy(state)) {
      await message(t("settings_saved"), {
        title: t("hint"),
        kind: "info",
      })
    }
  }

  const handleTunStackChange = async (stack: TunStack) => {
    const prev = tunStack
    setTunStackState(stack)
    try {
      await setTunStack(stack)
    } catch (e) {
      console.error("Failed to set tun stack:", e)
      setTunStackState(prev)
    }
  }

  const tunStackHint: Record<TunStack, string> = {
    system: t("use_system_stack"),
    gvisor: t("user_mode_stack"),
    mixed: t("tcp_system_udp_gvisor"),
  }

  const handleProxyPortChange = async (val: number) => {
    setPort(String(val))
    if (val > 0 && val <= 65535) {
      // Debounce writes — only persist after 500ms of no input
      if (proxyPortTimer.current) clearTimeout(proxyPortTimer.current)
      proxyPortTimer.current = setTimeout(async () => {
        const prev = initialPortsRef.current?.mixed
        await setProxyPort(val)
        if (prev !== undefined && prev !== val) {
          await warnIfEngineRunningForNetworkChange()
        }
        if (initialPortsRef.current) initialPortsRef.current.mixed = val
      }, 500)
    }
  }

  const handleApiPortChange = async (val: number) => {
    setApiPort(String(val))
    if (val > 0 && val <= 65535) {
      // Debounce writes — only persist after 500ms of no input
      if (apiPortTimer.current) clearTimeout(apiPortTimer.current)
      apiPortTimer.current = setTimeout(async () => {
        const prev = initialPortsRef.current?.controller
        await setControllerPort(val)
        if (prev !== undefined && prev !== val) {
          await warnIfEngineRunningForNetworkChange()
        }
        if (initialPortsRef.current) initialPortsRef.current.controller = val
      }, 500)
    }
  }

  const handleBypassBlur = async () => {
    const normalized = normalizeBypassInput(bypassList)
    setBypassList(normalized)
    if (normalized === savedBypass) return
    await setProxyBypass(normalized)
    setSavedBypass(normalized)
    await warnIfEngineRunningForNetworkChange()
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
                <span className={type.sectionTitle}>{t("appearance")}</span>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-1">
                  <div className="flex flex-col">
                    <span className={type.label}>{t("appearance_theme")}</span>
                    <span className={cn(type.caption, "mt-0.5")}>{t("select_theme")}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-0.5 rounded-lg bg-muted p-0.5 border border-border/60 w-full sm:w-[260px] shrink-0">
                    {(["system", "light", "dark"] as const).map((tKey) => (
                      <button
                        key={tKey}
                        type="button"
                        onClick={() => setTheme(tKey)}
                        className={cn(
                          "flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md py-1.5 text-xs font-semibold transition-all cursor-pointer",
                          theme === tKey ? cn(btn.pillActive, "shadow-xs") : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {tKey === "system" && <MonitorIcon className="size-3.5 shrink-0" />}
                        {tKey === "light" && <SunIcon className="size-3.5 shrink-0" />}
                        {tKey === "dark" && <MoonIcon className="size-3.5 shrink-0" />}
                        {tKey === "system" ? t("system") : tKey === "light" ? t("light") : t("dark")}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="h-px bg-border/40 my-0.5" />

                <div className="flex items-center justify-between gap-4 py-1">
                  <div className="flex flex-col min-w-0">
                    <span className={type.label}>{t("hide_on_launch")}</span>
                    <span className={cn(type.caption, "mt-0.5 truncate")}>{t("hide_on_launch_desc")}</span>
                  </div>
                  <Switch checked={hideOnLaunch} onCheckedChange={handleHideOnLaunchChange} size="sm" />
                </div>

                <div className="h-px bg-border/40 my-0.5" />

                <div className="flex items-center justify-between gap-4 py-1">
                  <div className="flex flex-col min-w-0">
                    <span className={type.label}>{t("minimize_to_tray")}</span>
                    <span className={cn(type.caption, "mt-0.5 truncate")}>{t("minimize_to_tray_desc")}</span>
                  </div>
                  <Switch checked={minimizeToTray} onCheckedChange={handleMinimizeToTrayChange} size="sm" />
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
                  <span className={type.sectionTitle}>{t("about_app")}</span>
                </div>
                <a
                  href="https://github.com/BadKid90s/AureStream"
                  target="_blank"
                  rel="noreferrer"
                  className={cn(type.link, "flex items-center gap-1 text-xs")}
                >
                  {t("open_source_home")} <ExternalLinkIcon className="size-3.5" />
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
                      <span className={cn(type.caption, "mt-0.5")}>{t("simple_proxy_client")}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={badge.brand}>{`v${appVersion}`}</span>
                    <span className={badge.success}>Stable</span>
                  </div>
                </div>

                <div className="h-px bg-border/40 my-0.5 shrink-0" />

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 py-1.5 text-xs text-muted-foreground shrink-0">
                  <div className="flex justify-between sm:flex-col sm:gap-1 border-b sm:border-b-0 sm:border-r border-border/40 pb-2 sm:pb-0 pr-4">
                    <span>{t("software_kernel")}</span>
                    <span className="font-semibold text-foreground">sing-box</span>
                  </div>
                  <div className="flex justify-between sm:flex-col sm:gap-1 border-b sm:border-b-0 sm:border-r border-border/40 pb-2 sm:pb-0 sm:px-4">
                    <span>{t("platform")}</span>
                    <span className="font-semibold text-foreground">macOS (Tauri)</span>
                  </div>
                  <div className="flex justify-between sm:flex-col sm:gap-1 sm:pl-4">
                    <span>{t("license")}</span>
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
                      {t("checking_update")}
                    </>
                  )}
                  {updateStatus === "latest" && (
                    <>
                      <ShieldCheckIcon className="size-4 mr-2 text-emerald-500" />
                      {t("current_latest")}
                    </>
                  )}
                  {updateStatus === "idle" && t("check_update")}
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
                <span className={type.sectionTitle}>{t("system_and_services")}</span>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-4 py-1">
                  <div className="flex flex-col min-w-0">
                    <span className={type.label}>{t("auto_start")}</span>
                    <span className={cn(type.caption, "mt-0.5 truncate")}>{t("auto_start_desc")}</span>
                  </div>
                  <Switch checked={autoStart} onCheckedChange={handleAutoStartChange} size="sm" />
                </div>

                <div className="h-px bg-border/40 my-0.5" />

                <div className="flex items-center justify-between gap-4 py-1">
                  <div className="flex flex-col min-w-0">
                    <span className={type.label}>{t("tun_service")}</span>
                    <span className={cn(type.caption, "mt-0.5 truncate")}>
                      {serviceStatus === "checking" && t("checking_service")}
                      {serviceStatus === "installed" && t("service_ready")}
                      {serviceStatus === "not_installed" && t("service_not_installed")}
                      {serviceStatus === "failed" && t("service_check_failed")}
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
                        {actionLoading && activeAction === "uninstall" ? t("uninstalling") : t("uninstall")}
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={serviceStatus === "checking" || actionLoading}
                        onClick={handleInstallService}
                        className="h-8 font-semibold text-xs rounded-lg"
                      >
                        {actionLoading && activeAction === "install" ? t("installing") : t("install")}
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
                <span className={type.sectionTitle}>{t("network_and_proxy")}</span>
              </div>

              {/* Scrollable settings content */}
              <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3 min-h-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-1 shrink-0">
                  <div className="flex flex-col">
                    <span className={type.label}>{t("tun_network_stack")}</span>
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
                    <span className={type.label}>{t("mixed_proxy_port")}</span>
                    <span className={cn(type.caption, "mt-0.5 truncate")}>{t("http_socks_port")}</span>
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
                    <span className={type.label}>{t("singbox_controller_port")}</span>
                    <span className={cn(type.caption, "mt-0.5 truncate")}>{t("controller_listen_port")}</span>
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
                    <span className={type.label}>{t("bypass_proxy_target")}</span>
                    <span className={cn(type.caption, "mt-1")}>
                      {t("direct_address_list")}
                    </span>
                  </div>
                  <textarea
                    value={bypassList}
                    onChange={(e) => setBypassList(e.target.value)}
                    onBlur={() => void handleBypassBlur()}
                    className="ui-textarea font-mono w-full sm:flex-1 min-h-[130px] flex-1 text-xs resize-none"
                    placeholder={BYPASS_PLACEHOLDER}
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
