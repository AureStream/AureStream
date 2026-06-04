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
  ArrowUpCircleIcon,
  CpuIcon,
  TerminalIcon,
  CheckIcon,
  AlertCircleIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { relaunch } from "@tauri-apps/plugin-process"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { btn, iconBadge, type } from "@/lib/typography"
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
import { SING_BOX_VERSION } from "@/types/definition"

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
  const [updateStatus, setUpdateStatus] = useState<"idle" | "checking" | "latest" | "available" | "downloading" | "ready" | "error">("idle")
  const updateRef = useRef<{ version: string; downloadAndInstall: (onProgress?: (p: any) => void) => Promise<void>; install: () => Promise<void> } | null>(null)
  const [updateVersion, setUpdateVersion] = useState("")

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

      // Auto-check for updates on mount
      try {
        const { check } = await import("@tauri-apps/plugin-updater")
        const upd = await check()
        if (upd) {
          updateRef.current = upd as any
          setUpdateVersion(upd.version)
          setUpdateStatus("available")
        } else {
          setUpdateStatus("latest")
        }
      } catch (e) {
        console.error("Auto update check failed:", e)
        setUpdateStatus("idle")
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


  const handleCheckUpdate = async () => {
    if (updateStatus === "ready") {
      try {
        await relaunch()
      } catch (e) {
        console.error("Relaunch via process plugin failed, falling back:", e)
        try { await invoke("restart"); } catch { try { await invoke("quit"); } catch {} }
      }
      return
    }
    if (updateStatus === "available") {
      setUpdateStatus("downloading")
      try {
        const upd = updateRef.current!
        await upd.downloadAndInstall()
        setUpdateStatus("ready")
      } catch (e) {
        console.error("Download/install failed:", e)
        setUpdateStatus("error")
      }
      return
    }
    setUpdateStatus("checking")
    try {
      const { check } = await import("@tauri-apps/plugin-updater")
      const upd = await check()
      if (upd) {
        updateRef.current = upd as any
        setUpdateVersion(upd.version)
        setUpdateStatus("available")
      } else {
        setUpdateStatus("latest")
      }
    } catch (e) {
      console.error("Update check failed:", e)
      setUpdateStatus("error")
    }
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
          <Card className="rounded-[20px] shadow-md border-border/60 hover:shadow-lg transition-all duration-300 flex-1 flex flex-col overflow-hidden min-h-[300px] bg-card/65 backdrop-blur-md">
            <CardContent className="py-5 px-6 flex flex-col gap-4 flex-1 min-h-0">
              <div className="flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="size-8 rounded-lg bg-slate-500/10 text-slate-500 dark:text-slate-400 flex items-center justify-center border border-slate-500/20">
                    <InfoIcon className="size-4.5" />
                  </div>
                  <span className={cn(type.sectionTitle, "font-bold tracking-wide")}>{t("about_app")}</span>
                </div>
                <a
                  href="https://github.com/BadKid90s/AureStream"
                  target="_blank"
                  rel="noreferrer"
                  className={cn(type.link, "flex items-center gap-1.5 text-xs font-semibold hover:underline group")}
                >
                  {t("open_source_home")} 
                  <ExternalLinkIcon className="size-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </a>
              </div>

              {/* Scrollable middle body */}
              <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-4 min-h-0">
                <div className="flex items-center justify-between py-1 shrink-0">
                  <div className="flex items-center gap-4.5">
                    <div className="relative size-12 rounded-2xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-base shadow-lg shadow-indigo-500/20 ring-2 ring-background hover:scale-105 hover:rotate-3 transition-all duration-300 select-none">
                      AS
                    </div>
                    <div className="flex flex-col leading-snug">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-base text-foreground tracking-tight">{`AureStream`}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/15">
                          {`v${appVersion}`}
                        </span>
                      </div>
                      <span className={cn(type.caption, "mt-1 font-medium")}>{t("simple_proxy_client")}</span>
                    </div>
                  </div>
                </div>

                <div className="h-px bg-border/40 my-0.5 shrink-0" />

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 py-1 shrink-0">
                  <div className="group flex flex-col justify-between rounded-xl bg-muted/20 border border-border/30 p-3.5 hover:border-indigo-500/20 hover:bg-muted/40 transition-all duration-300">
                    <span className="text-[11px] text-muted-foreground font-semibold flex items-center gap-1.5">
                      <TerminalIcon className="size-3.5 text-indigo-500" />
                      {t("software_kernel")}
                    </span>
                    <span className="font-bold text-foreground text-xs mt-2 truncate">{`sing-box ${SING_BOX_VERSION}`}</span>
                  </div>
                  <div className="group flex flex-col justify-between rounded-xl bg-muted/20 border border-border/30 p-3.5 hover:border-sky-500/20 hover:bg-muted/40 transition-all duration-300">
                    <span className="text-[11px] text-muted-foreground font-semibold flex items-center gap-1.5">
                      <CpuIcon className="size-3.5 text-sky-500" />
                      {t("platform")}
                    </span>
                    <span className="font-bold text-foreground text-xs mt-2 truncate">
                      {typeof window !== "undefined" && navigator.userAgent.includes("Windows") ? "Windows (Tauri)" : "macOS (Tauri)"}
                    </span>
                  </div>
                  <div className="group flex flex-col justify-between rounded-xl bg-muted/20 border border-border/30 p-3.5 hover:border-emerald-500/20 hover:bg-muted/40 transition-all duration-300">
                    <span className="text-[11px] text-muted-foreground font-semibold flex items-center gap-1.5">
                      <ShieldCheckIcon className="size-3.5 text-emerald-500" />
                      {t("license")}
                    </span>
                    <span className="font-bold text-foreground text-xs mt-2 truncate">MIT License</span>
                  </div>
                </div>

                <div className="h-px bg-border/40 my-0.5 shrink-0" />

                {/* Unified Interactive Update Checker Section */}
                <div className="rounded-xl border border-border/40 bg-muted/15 p-3 shrink-0">
                  {updateStatus === "idle" && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-muted-foreground font-medium">{t("current_latest")}</span>
                      <button
                        onClick={handleCheckUpdate}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs transition-colors cursor-pointer group"
                      >
                        <RefreshCwIcon className="size-3.5 group-hover:rotate-180 transition-transform duration-500" />
                        {t("check_update")}
                      </button>
                    </div>
                  )}

                  {updateStatus === "checking" && (
                    <div className="flex items-center gap-3 py-0.5">
                      <RefreshCwIcon className="size-4 text-primary animate-spin" />
                      <span className="text-xs text-muted-foreground font-medium">{t("checking_update")}</span>
                    </div>
                  )}

                  {updateStatus === "latest" && (
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <CheckIcon className="size-4 text-emerald-500" />
                        <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">{t("current_latest")}</span>
                      </div>
                      <button
                        onClick={handleCheckUpdate}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-muted hover:bg-muted-foreground/10 text-muted-foreground font-medium text-xs transition-colors cursor-pointer"
                      >
                        <RefreshCwIcon className="size-3" />
                        {t("check_update")}
                      </button>
                    </div>
                  )}

                  {updateStatus === "available" && (
                    <div className="flex items-center justify-between gap-3 bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <ArrowUpCircleIcon className="size-4.5 text-emerald-500 shrink-0" />
                        <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 truncate">
                          {t("update_available", { version: updateVersion })}
                        </span>
                      </div>
                      <div className="flex items-center gap-2.5 shrink-0">
                        <a
                          href={`https://github.com/BadKid90s/AureStream/releases/tag/v${updateVersion}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] font-semibold text-emerald-600/80 dark:text-emerald-400/70 hover:underline"
                        >
                          {t("go_to_release")}
                        </a>
                        <button
                          onClick={handleCheckUpdate}
                          className="rounded-md bg-emerald-600 dark:bg-emerald-500 text-white text-[11px] font-bold px-3 py-1.5 hover:bg-emerald-700 dark:hover:bg-emerald-600 shadow-sm shadow-emerald-500/10 transition-colors cursor-pointer"
                        >
                          {t("upgrade_now")}
                        </button>
                      </div>
                    </div>
                  )}

                  {updateStatus === "downloading" && (
                    <div className="flex items-center gap-3 py-0.5">
                      <div className="relative flex size-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full size-2 bg-indigo-500"></span>
                      </div>
                      <span className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold animate-pulse">{t("downloading_update")}</span>
                    </div>
                  )}

                  {updateStatus === "ready" && (
                    <div className="flex items-center justify-between gap-3 bg-indigo-500/5 dark:bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <ArrowUpCircleIcon className="size-4.5 text-indigo-500 shrink-0" />
                        <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 truncate">
                          {t("update_ready")}
                        </span>
                      </div>
                      <button
                        onClick={handleCheckUpdate}
                        className="rounded-md bg-indigo-600 dark:bg-indigo-500 text-white text-[11px] font-bold px-3 py-1.5 hover:bg-indigo-700 dark:hover:bg-indigo-600 shadow-sm shadow-indigo-500/10 transition-colors cursor-pointer"
                      >
                        {t("upgrade_now")}
                      </button>
                    </div>
                  )}

                  {updateStatus === "error" && (
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <AlertCircleIcon className="size-4 text-destructive" />
                        <span className="text-xs text-destructive font-semibold">{t("update_check_error")}</span>
                      </div>
                      <button
                        onClick={handleCheckUpdate}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-destructive/10 hover:bg-destructive/20 text-destructive font-bold text-xs transition-colors cursor-pointer"
                      >
                        <RefreshCwIcon className="size-3" />
                        {t("check_update")}
                      </button>
                    </div>
                  )}
                </div>
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
