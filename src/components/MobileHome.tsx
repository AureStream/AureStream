import { useState, useEffect, useCallback, useRef } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { type ProxyMode } from "../types/proxy-mode"
import { fetchSubscriptions, type Subscription } from "../api/subscriptions"
import { stopEngine } from "../utils/vpn-service"
import { useEngineState } from "../hooks/useEngineState"
import { useTrafficAccumulator } from "../hooks/useTrafficAccumulator"
import { connectEngine } from "../lib/connection-flow"
import { getEnableTun, setEnableTun, getStoreValue, setStoreValue } from "../single/store"
import { SSI_STORE_KEY, selectedNodeTagStoreKey } from "../types/definition"
import { insertSubscription, getSubscriptionConfig, getLocalSubscriptions, deleteSubscription, updateLocalSubscriptionMeta } from "../action/db"
import { syncActiveConnectionConfig, withScheduledConfigSyncSuspended } from "../lib/config-sync"
import { syncRemoteSubscriptionsToLocal } from "../lib/subscription-sync"
import { switchProxyMode } from "../lib/mode-switch"
import {
  planTrayModeAction,
  uiModeFromEngineState,
  type TrayRequestedMode,
} from "../lib/tray-mode"
import { getNodeLatency, initNodeLatency } from "../lib/node-latency"
import { probeEngineServiceState, ensureEngineServiceInstalled, invalidateEngineProbeCache } from "../lib/engine-probe"
import { shouldEnsureTunServiceBeforeModeAction } from "../lib/proxy-mode-transition"
import { message } from "@tauri-apps/plugin-dialog"
import { openUrl } from "@tauri-apps/plugin-opener"
import { shouldAllowConnectionToggle } from "../lib/home-network-info"
import { listen } from "@tauri-apps/api/event"
import MobileTopBar, { topBarIconBtnClass } from "./MobileTopBar"

const ONE_GB_BYTES = 1024 * 1024 * 1024
const ONE_TB_BYTES = 1024 * 1024 * 1024 * 1024

/* ── Icons ── */
const I = {
  Globe: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20"/><path d="M2 12h20"/></svg>),
  Activity: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>),
  Info: () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>),
}

export default function MobileHome() {
  const { i18n } = useTranslation()
  const navigate = useNavigate()
  const {
    isStopping,
    engineState
  } = useEngineState()

  const l = (en: string, zh: string) => i18n.language.startsWith('zh') ? zh : en;
  const formatDate = (ts: number) => {
    const d = new Date(ts * 1000)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return i18n.language.startsWith('zh')
      ? `${y}年${m}月${day}日`
      : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  const [proxyMode, setProxyMode] = useState<ProxyMode>("rule")
  const [localConnecting, setLocalConnecting] = useState(false)
  const [isInstallingService, setIsInstallingService] = useState(false)
  const isConnected = engineState.kind === "running"
  const isConnecting = isStopping || engineState.kind === "starting" || (localConnecting && !isConnected)
  const canToggleConnection = shouldAllowConnectionToggle(engineState.kind, localConnecting)

  useEffect(() => {
    const initMode = async () => {
      const tun = await getEnableTun()
      setProxyMode(tun ? "tun" : "rule")
    }
    initMode()
  }, [])

  useEffect(() => {
    // Only clear the local connecting flag on terminal states.
    // During mode switching (Stopping → Idle → Starting), the flag
    // is managed by the finally block of the switch/toggle handler.
    if (engineState.kind === "running" || engineState.kind === "starting" || engineState.kind === "failed") {
      setLocalConnecting(false)
    }
  }, [engineState.kind])

  // 同步主界面与后台引擎/系统托盘切换后的代理模式状态
  useEffect(() => {
    const engineUiMode = uiModeFromEngineState(engineState)
    if (engineUiMode && proxyMode !== engineUiMode) {
      setProxyMode(engineUiMode)
      void withScheduledConfigSyncSuspended(() => setEnableTun(engineUiMode === "tun"))
    }
  }, [engineState, proxyMode])

  const [activeNodeId, setActiveNodeId] = useState<string>("")
  const [nodes, setNodes] = useState<any[]>([])
  const [activeNodePing, setActiveNodePing] = useState<number>(0)
  const [connectTime, setConnectTime] = useState<number>(0)

  useEffect(() => {
    let interval: any
    if (isConnected) {
      interval = setInterval(() => {
        setConnectTime(prev => prev + 1)
      }, 1000)
    } else {
      setConnectTime(0)
    }
    return () => clearInterval(interval)
  }, [isConnected])

  const formatDuration = (seconds: number) => {
    const h = String(Math.floor(seconds / 3600)).padStart(2, '0')
    const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')
    const s = String(seconds % 60).padStart(2, '0')
    return `${h}:${m}:${s}`
  }

  // Node latency is display-only on the dashboard. Measurements happen from the
  // Nodes page and are shared through the in-memory/SQLite latency cache.
  useEffect(() => {
    let active = true
    if (!activeNodeId) {
      setActiveNodePing(0)
      return
    }

    setActiveNodePing(getNodeLatency(activeNodeId) ?? 0)
    initNodeLatency().then(() => {
      if (active) {
        setActiveNodePing(getNodeLatency(activeNodeId) ?? 0)
      }
    })

    return () => { active = false }
  }, [activeNodeId])


  const [subs, setSubs] = useState<Subscription[]>([])
  const [subsLoading, setSubsLoading] = useState(true)

  // Guard against concurrent tray-triggered operations (prevents start/stop
  // cascade when the user clicks a tray item multiple times in quick succession).
  const trayOperationRef = useRef(false)
  const connectionOperationRef = useRef(false)
  const engineStateRef = useRef(engineState)
  const subsRef = useRef(subs)
  const proxyModeRef = useRef(proxyMode)

  useEffect(() => {
    engineStateRef.current = engineState
  }, [engineState])

  useEffect(() => {
    subsRef.current = subs
  }, [subs])

  useEffect(() => {
    proxyModeRef.current = proxyMode
  }, [proxyMode])

  // Reset tray operation guard when the engine settles into a stable state.
  useEffect(() => {
    if (engineState.kind === "running" || engineState.kind === "idle" || engineState.kind === "failed") {
      trayOperationRef.current = false
    }
  }, [engineState.kind])

  // 监听系统托盘发出的代理模式切换事件，执行完整关闭、配置合并及启动流程
  useEffect(() => {
    const unlistenPromise = listen<string>("tray-switch-mode", async (event) => {
      // Prevent concurrent tray-triggered operations.
      if (trayOperationRef.current) {
        console.warn("[tray-switch] operation already in progress, ignoring")
        return
      }
      trayOperationRef.current = true

      const targetMode = event.payload
      if (targetMode !== "system" && targetMode !== "tun") {
        console.warn("[tray-switch] invalid mode:", targetMode)
        trayOperationRef.current = false
        return
      }

      const plan = planTrayModeAction(engineStateRef.current, targetMode as TrayRequestedMode)

      try {
        if (plan.action === "disconnect") {
          // Clicking the active mode in tray: disconnect
          setLocalConnecting(true)
          await stopEngine()
        } else {
          if (shouldEnsureTunServiceBeforeModeAction(plan.action, plan.targetUiMode)) {
            const ready = await ensureTunServiceReady()
            if (!ready) return
          }

          const isTun = plan.targetUiMode === "tun"
          setLocalConnecting(plan.action === "connect" || plan.action === "switch")
          await withScheduledConfigSyncSuspended(async () => {
            if (plan.action === "switch") {
              // Mode switch via stop() + start()
              const subId = (await getStoreValue(SSI_STORE_KEY)) || (subsRef.current[0]?.id ?? "")
              await switchProxyMode(subId, "rule", isTun)
            } else if (plan.action === "connect") {
              // Engine not running: use the same guarded connection flow as the main button.
              const subId = (await getStoreValue(SSI_STORE_KEY)) || (subsRef.current[0]?.id ?? "")
              await connectEngine(subId, "rule", isTun)
            }

            setProxyMode(plan.targetUiMode)
            await setEnableTun(isTun)
          })
        }
      } catch (err) {
        console.error("Tray switch engine failed:", err)
        setProxyMode(proxyModeRef.current)
        await withScheduledConfigSyncSuspended(() => setEnableTun(proxyModeRef.current === "tun"))
      } finally {
        setLocalConnecting(false)
        trayOperationRef.current = false
      }
    })

    return () => {
      unlistenPromise.then((unlisten) => unlisten())
    }
  }, [])

  // Shared helper: ensure the TUN helper service is installed before starting/switching.
  // Returns true when the service is ready (or was just installed), false when
  // installation fails.
  const ensureTunServiceReady = async (): Promise<boolean> => {
    try {
      const serviceState = await probeEngineServiceState(true)
      if (serviceState === "ready") return true

      // Missing or unreachable — install without asking.
      try {
        setIsInstallingService(true)
        await ensureEngineServiceInstalled()
        invalidateEngineProbeCache()
        return true
      } catch (installErr) {
        console.error("Service installation failed:", installErr)
        await message(
          l(
            `Failed to install helper service: ${installErr}`,
            `辅助服务安装失败：${installErr}`
          ),
          { title: l("Installation Failed", "安装失败"), kind: "error" }
        )
        return false
      } finally {
        setIsInstallingService(false)
      }
    } catch (probeErr) {
      console.error("Service probe failed:", probeErr)
      return false
    }
  }

  const handleToggleConnection = async () => {
    if (connectionOperationRef.current || !canToggleConnection) return
    connectionOperationRef.current = true
    try {
      if (isConnected) {
        setLocalConnecting(true)
        await stopEngine()
      } else {
        const isTun = proxyMode === "tun"
        if (isTun) {
          const ready = await ensureTunServiceReady()
          if (!ready) return
        }

        setLocalConnecting(true)
        const subId = (await getStoreValue(SSI_STORE_KEY)) || (subs[0]?.id ?? "")
        await connectEngine(subId, "rule", isTun)
      }
    } catch (err) {
      console.error("Toggle connection failed:", err)
    } finally {
      setLocalConnecting(false)
      connectionOperationRef.current = false
    }
  }

  const handleSwitchMode = async (newMode: "rule" | "tun") => {
    if (isConnecting || isInstallingService) return
    if (proxyMode === newMode) return
    const isTun = newMode === "tun"
    const previousMode = proxyMode

    if (isTun) {
      const ready = await ensureTunServiceReady()
      if (!ready) return
    }

    try {
      await withScheduledConfigSyncSuspended(async () => {
        if (!isConnected) {
          setProxyMode(newMode)
          await setEnableTun(isTun)
          return
        }

        setLocalConnecting(true)
        const subId = (await getStoreValue(SSI_STORE_KEY)) || (subs[0]?.id ?? "")
        await switchProxyMode(subId, "rule", isTun)
        setProxyMode(newMode)
        await setEnableTun(isTun)
      })
    } catch (err) {
      console.error("Switch mode failed:", err)
      setProxyMode(previousMode)
      await withScheduledConfigSyncSuspended(() => setEnableTun(previousMode === "tun"))
    } finally {
      setLocalConnecting(false)
    }
  }

  const loadSubs = useCallback(async () => {
    try {
      // 1. Load from SQLite first so login-initialized data paints immediately
      const localData = await getLocalSubscriptions()
      if (localData && localData.length > 0) {
        setSubs(localData)
        setSubsLoading(false)
      }

      // 2. Sync list/metadata from API; only download configs for brand-new subs
      const updatedLocal = await syncRemoteSubscriptionsToLocal({
        fetchSubscriptions,
        getLocalSubscriptions,
        deleteSubscription,
        insertSubscription,
        updateLocalSubscriptionMeta,
        getSelectedSubscriptionId: () => getStoreValue(SSI_STORE_KEY),
        setSelectedSubscriptionId: (id) => setStoreValue(SSI_STORE_KEY, id),
        syncActiveConnectionConfig,
      })
      setSubs(updatedLocal)
    } catch (err) {
      console.error("[HOME] Failed to fetch and sync subscriptions:", err)
    } finally {
      setSubsLoading(false)
    }
  }, [])

  // Lightweight refresh for traffic accumulator: only reload local DB data,
  // does NOT re-fetch remote subscription configs.
  const refreshLocalSubs = useCallback(async () => {
    try {
      const localData = await getLocalSubscriptions()
      if (localData && localData.length > 0) {
        setSubs(localData)
      }
    } catch (err) {
      // silent
    }
  }, [])

  useTrafficAccumulator(refreshLocalSubs)

  // Run initial subscription sync exactly once on app startup.
  const hasInitiallyLoadedRef = useRef(false)
  useEffect(() => {
    if (hasInitiallyLoadedRef.current) return
    hasInitiallyLoadedRef.current = true
    loadSubs()
  }, [loadSubs])

  // Load nodes dynamically from active subscription in SQLite
  useEffect(() => {
    const loadNodes = async () => {
      const activeSubId = (await getStoreValue(SSI_STORE_KEY)) || (subs[0]?.id ?? "")
      if (!activeSubId) return
      try {
        const config = await getSubscriptionConfig(activeSubId)
        if (config && Array.isArray(config.outbounds)) {
          // Filter out selector, urltest, direct, block, and dns outbounds to get proxy nodes
          const filtered = config.outbounds.filter((item: any) => {
            return item.type !== "selector" && item.type !== "urltest" && item.type !== "direct" && item.type !== "block" && item.type !== "dns";
          });

          // Map to UI node model
          const mapped = filtered.map((n: any) => {
            const tag = n.tag || "";
            let flag = "🌐";
            let region: "asia" | "america" | "europe" = "asia";

            if (tag.includes("日本") || tag.toLowerCase().includes("jp") || tag.toLowerCase().includes("tokyo")) {
              flag = "🇯🇵";
              region = "asia";
            } else if (tag.includes("新加坡") || tag.toLowerCase().includes("sg") || tag.toLowerCase().includes("singapore")) {
              flag = "🇸🇬";
              region = "asia";
            } else if (tag.includes("香港") || tag.toLowerCase().includes("hk") || tag.toLowerCase().includes("hong kong")) {
              flag = "🇭🇰";
              region = "asia";
            } else if (tag.includes("美国") || tag.toLowerCase().includes("us") || tag.toLowerCase().includes("america") || tag.toLowerCase().includes("los angeles") || tag.toLowerCase().includes("new york")) {
              flag = "🇺🇸";
              region = "america";
            } else if (tag.includes("英国") || tag.toLowerCase().includes("uk") || tag.toLowerCase().includes("london") || tag.toLowerCase().includes("gb")) {
              flag = "🇬🇧";
              region = "europe";
            } else if (tag.toLowerCase().includes("de") || tag.includes("德国") || tag.toLowerCase().includes("frankfurt")) {
              flag = "🇩🇪";
              region = "europe";
            }

            return {
              id: tag,
              loc: tag,
              flag,
              protocol: n.type || "Shadowsocks",
              region,
              server: n.server || "",
              port: Number(n.server_port) || 0,
            };
          });
          setNodes(mapped);
          if (mapped.length > 0) {
            const savedTag = (await getStoreValue(selectedNodeTagStoreKey(activeSubId), "")) as string
            const exists = savedTag && mapped.some((n: any) => n.id === savedTag)
            setActiveNodeId(exists ? savedTag : mapped[0].id)
          }
        }
      } catch (err) {
        console.error("Failed to load subscription nodes:", err);
      }
    };
    if (!subsLoading) {
      loadNodes();
    }
  }, [subsLoading, subs]);

  // Dynamic subscription nodes data
  const allNodes = nodes.map(n => ({ ...n, active: isConnected && n.id === activeNodeId }))
  const currentNode = allNodes.find(n => n.id === activeNodeId)

  // Traffic summary for the home header
  const hasSub = subs.length > 0
  const sub = subs[0]
  const trafficTotal = (hasSub && sub.traffic_total > 1) ? sub.traffic_total : ONE_TB_BYTES
  const trafficUsed = hasSub ? sub.traffic_used : 0
  const remainingBytes = Math.max(0, trafficTotal - trafficUsed)
  const usedBytes = Math.max(0, trafficTotal - remainingBytes)
  const usedText = subsLoading || !hasSub ? "--" : `${(usedBytes / ONE_GB_BYTES).toFixed(4)} GB`
  const remainingGBValue = subsLoading || !hasSub ? "--" : (remainingBytes / ONE_GB_BYTES).toFixed(4)
  const totalGBText = subsLoading || !hasSub ? "--" : `${(trafficTotal / ONE_GB_BYTES).toFixed(2)} GB`
  const expireText = hasSub && sub.expire_time ? formatDate(sub.expire_time) : "--"
  const remainingPercent = hasSub && trafficTotal > 0 ? Math.min(100, (remainingBytes / trafficTotal) * 100) : 0

  return (
    <div className="flex flex-col w-full h-full animate-fade-in overflow-hidden">
      {/* Row 1: Top Navigation Bar */}
      <div className="w-full shrink-0">
        <MobileTopBar
          left={
            <button
              onClick={() => navigate("/dashboard/about")}
              className={topBarIconBtnClass}
              aria-label="About"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
            </button>
          }
          right={
            <button
              onClick={() => navigate("/dashboard/profile")}
              className={topBarIconBtnClass}
              aria-label="Profile"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </button>
          }
        />
      </div>

      {/* Main 5-Row Stack Container (Anchors bottom deck to screen bottom) */}
      <div className="flex-1 flex flex-col justify-between min-h-0 w-full overflow-y-auto no-scrollbar pb-1">
        {/* Row 2: Subscription Card Row */}
        <div className="w-full px-4 pt-1 pb-1 shrink-0">
          <div className="bg-white/70 dark:bg-bg-alt/70 rounded-2xl px-[25px] py-[15px] border border-slate-200/80 dark:border-white/10 flex flex-col gap-4">
            {/* Top Row: Remaining Traffic + Semicircle Percentage Gauge */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5 min-w-0 flex-1 pr-1">
                <span className="text-base font-extrabold text-slate-600 dark:text-slate-300">{l("Remaining Traffic", "剩余流量")}</span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-4xl font-black text-slate-900 dark:text-white tracking-tight tabular-nums">{remainingGBValue}</span>
                  <span className="text-base font-black text-slate-500">GB</span>
                </div>
                <span className="text-sm font-bold text-slate-400 mt-0.5">
                  {l("Total Plan", "本月套餐共")} {totalGBText}
                </span>
              </div>

              <div className="relative h-22 w-32 shrink-0">
                <svg className="h-full w-full overflow-visible" viewBox="0 0 120 74" aria-hidden="true">
                  <defs>
                    <linearGradient id="trafficGaugeGradient" x1="12" y1="62" x2="108" y2="14" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stopColor="#DDF98C" />
                      <stop offset="58%" stopColor="#7BE06C" />
                      <stop offset="100%" stopColor="#20C997" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M 12 62 A 48 48 0 0 1 108 62"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="5"
                    strokeLinecap="round"
                    className="text-slate-200 dark:text-slate-700"
                  />
                  <path
                    d="M 12 62 A 48 48 0 0 1 108 62"
                    fill="none"
                    stroke="url(#trafficGaugeGradient)"
                    strokeWidth="5"
                    strokeLinecap="round"
                    pathLength="100"
                    strokeDasharray="100"
                    strokeDashoffset={100 - remainingPercent}
                  />
                </svg>
                <div className="absolute inset-x-0 top-[42px] flex items-center justify-center">
                  <span className="text-xl font-black text-slate-900 dark:text-white tabular-nums">{remainingPercent.toFixed(0)}%</span>
                </div>
              </div>
            </div>

            <div className="w-full h-px bg-slate-100 dark:bg-white/5" />

            {/* Bottom Row: Used Traffic + Expire Date */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#EFECFF] dark:bg-[#6C5CFF]/20 text-[#6C5CFF] flex items-center justify-center shrink-0">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="m21 8-4-4-4 4"/><path d="M17 4v16"/></svg>
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-black text-slate-400">{l("Used", "已使用")}</span>
                  <span className="text-base font-black text-slate-900 dark:text-white truncate">{usedText}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#EFECFF] dark:bg-[#6C5CFF]/20 text-[#6C5CFF] flex items-center justify-center shrink-0">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-black text-slate-400">{l("Expiration", "到期时间")}</span>
                  <span className="text-base font-black text-slate-900 dark:text-white truncate">{expireText}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Row 3: Connection Power Button Row */}
        <div className="w-full px-4 pt-0 pb-1 flex-1 flex flex-col items-center justify-center min-h-0 z-10">
          {/* Connection Status & Live Duration Display */}
          <div className="flex items-center justify-center w-full min-h-[36px] mb-4">
            {isConnected ? (
              <div className="inline-flex items-center gap-2.5 px-4.5 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-base font-black font-mono tracking-wider">
                <span className="w-3 h-3 rounded-full bg-emerald-500" />
                <span>{formatDuration(connectTime)}</span>
              </div>
            ) : isConnecting ? (
              <div className="inline-flex items-center gap-2.5 px-4.5 py-2 rounded-full bg-[#6C5CFF]/10 border border-[#6C5CFF]/20 text-[#6C5CFF] text-base font-black tracking-wide">
                <span className="w-3 h-3 rounded-full bg-[#6C5CFF]" />
                <span>{l("Connecting…", "正在连接…")}</span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-2.5 px-4.5 py-2 rounded-full bg-slate-100 dark:bg-white/5 border border-slate-200/60 dark:border-white/10 text-slate-700 dark:text-slate-200 text-sm font-black tracking-wide">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                <span>{l("Tap central button to connect", "点击按钮进行连接")}</span>
              </div>
            )}
          </div>

          {/* Central Power Button Sphere */}
          <div className="relative flex items-center justify-center">
            <div className={`w-64 h-64 rounded-full border transition-colors duration-300 flex items-center justify-center p-4 ${
              isConnected
                ? "border-[#6C5CFF]/50 bg-[#EFECFF]/80 dark:bg-[#6C5CFF]/10"
                : "border-slate-200 dark:border-white/10 bg-transparent"
            }`}>
              <div className={`w-50 h-50 rounded-full border transition-colors duration-300 flex items-center justify-center ${
                isConnected
                  ? "border-[#6C5CFF]/25 bg-white/80 dark:bg-bg-alt/80"
                  : "border-slate-200/90 dark:border-white/10 bg-white/60 dark:bg-bg-alt/40"
              }`}>
                <button
                  onClick={handleToggleConnection}
                  disabled={!canToggleConnection}
                  className="w-36 h-36 rounded-full flex items-center justify-center cursor-pointer transition-colors hover:bg-slate-50/80 dark:hover:bg-white/5 active:opacity-80 focus:outline-none"
                >
                  <svg width="68" height="68" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={isConnected ? "text-[#6C5CFF] transition-colors" : "text-slate-300 dark:text-slate-600 transition-colors"}>
                    <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                    <line x1="12" y1="2" x2="12" y2="12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Protection Hint */}
          <div className="flex flex-col items-center gap-0.5 text-center mt-8">
            <div className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200 font-black">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
              <span>{isConnected ? l("Data Tunnel Protection Active", "数据隧道保护已启用") : l("Data Tunnel Protection Inactive", "数据隧道保护未启用")}</span>
            </div>
          </div>
        </div>

        {/* Row 4: Node Card & Mode Switcher Row */}
        <div className="w-full px-4 pt-1 pb-10 shrink-0 flex flex-col gap-7 max-w-[340px] mx-auto">
          {/* Integrated Multiline Node Selection Button */}
          <button
            type="button"
            onClick={() => navigate("/dashboard/nodes")}
            className="bg-white/70 dark:bg-bg-alt/70 rounded-2xl p-4 border border-slate-200/80 dark:border-white/10 flex items-center justify-between gap-3.5 w-full text-left cursor-pointer transition-colors hover:bg-white dark:hover:bg-bg-alt"
          >
            <div className="flex items-center gap-3.5 min-w-0 flex-1">
              <span className="text-3xl shrink-0 select-none">{currentNode ? currentNode.flag : "🌐"}</span>
              <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                <h3 className="text-lg font-black text-slate-900 dark:text-white truncate">
                  {currentNode ? currentNode.loc : l("No Node Selected", "未选择任何节点")}
                </h3>
                <div className="flex items-center justify-between w-full text-xs text-slate-400 dark:text-slate-500 font-semibold">
                  <span className="font-mono font-bold uppercase">
                    {currentNode ? currentNode.protocol : "VLESS"}
                  </span>
                  <span className="flex items-center gap-1 font-mono font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#6C5CFF]" />
                    {currentNode ? `${activeNodePing || 75} ms` : "--"}
                  </span>
                </div>
              </div>
            </div>

            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 shrink-0">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>

          {/* Mode Switcher Segmented Control */}
          <div className="bg-transparent border border-slate-200/80 dark:border-white/10 rounded-2xl p-1 w-full flex gap-1">
            <button
              onClick={() => handleSwitchMode('rule')}
              className={`flex-1 py-2.5 rounded-xl font-black text-sm flex items-center justify-center gap-1.5 transition-colors ${
                proxyMode === 'rule'
                  ? 'bg-[#EFECFF] dark:bg-[#6C5CFF]/20 text-[#6C5CFF] font-black'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <I.Activity />
              <span>{l("Smart Routing", "智能分流")}</span>
            </button>

            <button
              onClick={() => handleSwitchMode('tun')}
              disabled={isInstallingService}
              className={`flex-1 py-2.5 rounded-xl font-black text-sm flex items-center justify-center gap-1.5 transition-colors ${
                isInstallingService
                  ? 'text-slate-400 cursor-wait'
                  : proxyMode === 'tun'
                    ? 'bg-[#EFECFF] dark:bg-[#6C5CFF]/20 text-[#6C5CFF] font-black'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {isInstallingService ? (
                <svg className="h-4.5 w-4.5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <I.Globe />
              )}
              <span>{isInstallingService ? l("Installing...", "安装中...") : l("Virtual NIC", "虚拟网卡")}</span>
            </button>
          </div>
        </div>

        {/* Row 5: Official Website & About Footer Row */}
        <div className="w-full px-4 pt-1 pb-3 shrink-0 flex items-center justify-center gap-6">
          <button
            onClick={() => openUrl("https://github.com/BadKid90s/AureStream")}
            className="flex items-center gap-1.5 text-sm font-extrabold text-slate-500 hover:text-slate-700 transition-colors cursor-pointer"
          >
            <I.Globe /> {l("Official Website", "官方网站")}
          </button>
          <button
            onClick={() => navigate("/dashboard/about")}
            className="flex items-center gap-1.5 text-sm font-extrabold text-slate-500 hover:text-slate-700 transition-colors cursor-pointer"
          >
            <I.Info /> {l("About", "关于本软件")}
          </button>
        </div>
      </div>
    </div>
  )
}
