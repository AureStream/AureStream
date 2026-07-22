import { useState, useEffect, useCallback, useRef } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { type ProxyMode } from "../types/proxy-mode"
import { fetchSubscriptions, type Subscription } from "../api/subscriptions"
import { startEngine, stopEngine } from "../utils/vpn-service"
import { useEngineState } from "../hooks/useEngineState"
import { useTrafficAccumulator } from "../hooks/useTrafficAccumulator"
import { mergeConnectionConfig } from "../lib/connection-config"
import { getConfigJsonPath } from "../lib/app-paths"
import { getEnableTun, setEnableTun, getStoreValue, setStoreValue } from "../single/store"
import { SSI_STORE_KEY, selectedNodeTagStoreKey } from "../types/definition"
import { insertSubscription, getSubscriptionConfig, getLocalSubscriptions, deleteSubscription } from "../action/db"
import { syncActiveConnectionConfig, withScheduledConfigSyncSuspended } from "../lib/config-sync"
import { switchProxyMode } from "../lib/mode-switch"
import {
  planTrayModeAction,
  uiModeFromEngineState,
  type TrayRequestedMode,
} from "../lib/tray-mode"
import { getNodeLatency, initNodeLatency } from "../lib/node-latency"
import { getNodeLatencyTone } from "../lib/node-latency-tone"
import { probeEngineServiceState, ensureEngineServiceInstalled, invalidateEngineProbeCache } from "../lib/engine-probe"
import { message } from "@tauri-apps/plugin-dialog"
import { openUrl } from "@tauri-apps/plugin-opener"
import { shouldAllowConnectionToggle } from "../lib/home-network-info"
import { listen } from "@tauri-apps/api/event"
import MobileTopBar from "./MobileTopBar"

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

  const renderPing = (p: number) => {
    if (p < 0) return <span className="text-danger text-xs font-mono font-bold whitespace-nowrap">{l("Timeout", "超时")}</span>
    if (p === 0) return <span className="text-text-muted text-xs font-mono font-bold whitespace-nowrap">-- ms</span>
    const tone = getNodeLatencyTone(p)
    return (
      <span className={`flex items-center gap-1.5 text-xs font-mono font-extrabold whitespace-nowrap ${tone.text}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`}></span>{p}ms
      </span>
    )
  }

  const [subs, setSubs] = useState<Subscription[]>([])
  const [subsLoading, setSubsLoading] = useState(true)

  // Guard against concurrent tray-triggered operations (prevents start/stop
  // cascade when the user clicks a tray item multiple times in quick succession).
  const trayOperationRef = useRef(false)
  const connectionOperationRef = useRef(false)
  const engineStateRef = useRef(engineState)
  const subsRef = useRef(subs)

  useEffect(() => {
    engineStateRef.current = engineState
  }, [engineState])

  useEffect(() => {
    subsRef.current = subs
  }, [subs])

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
          setLocalConnecting(plan.action === "connect")
          await withScheduledConfigSyncSuspended(async () => {
            const isTun = plan.targetUiMode === "tun"
            setProxyMode(plan.targetUiMode)
            await setEnableTun(isTun)

            if (plan.action === "switch") {
              // Mode switch via stop() + start()
              const subId = (await getStoreValue(SSI_STORE_KEY)) || (subsRef.current[0]?.id ?? "")
              await switchProxyMode(subId, "rule", isTun)
            } else if (plan.action === "connect") {
              // Engine not running: generate config and start
              const subId = (await getStoreValue(SSI_STORE_KEY)) || (subsRef.current[0]?.id ?? "")
              await mergeConnectionConfig(subId, "rule", isTun, { force: true })
              const configPath = await getConfigJsonPath()
              await startEngine(configPath, plan.targetEngineMode)
            }
          })
        }
      } catch (err) {
        console.error("Tray switch engine failed:", err)
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

        await mergeConnectionConfig(subId, "rule", isTun, { force: true })
        const configPath = await getConfigJsonPath()

        await startEngine(configPath, isTun ? "IntoProxy" : "SystemProxy")
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

    if (isTun) {
      const ready = await ensureTunServiceReady()
      if (!ready) return
    }

    try {
      await withScheduledConfigSyncSuspended(async () => {
        setProxyMode(newMode)
        await setEnableTun(isTun)

        if (!isConnected) {
          return
        }

        setLocalConnecting(true)
        const subId = (await getStoreValue(SSI_STORE_KEY)) || (subs[0]?.id ?? "")
        await switchProxyMode(subId, "rule", isTun)
      })
    } catch (err) {
      console.error("Switch mode failed:", err)
    } finally {
      setLocalConnecting(false)
    }
  }

  const loadSubs = useCallback(async () => {
    try {
      // 1. Load from SQLite database first for instant UI response
      const localData = await getLocalSubscriptions()
      if (localData && localData.length > 0) {
        setSubs(localData)
        setSubsLoading(false)
      }

      // 2. Fetch the latest subscription list from the server to sync
      const remoteSubs = await fetchSubscriptions()

      // 3. Sync database with remote list
      if (Array.isArray(remoteSubs)) {
        const remoteIds = remoteSubs.map(s => s.id)

        // A. Delete local subscriptions that do not exist on the server anymore (orphaned/dirty data)
        const localList = await getLocalSubscriptions()
        for (const local of localList) {
          if (!remoteIds.includes(local.id)) {
            await deleteSubscription(local.id)
          }
        }

        // B. Insert or update remote subscriptions in local database
        for (const sub of remoteSubs) {
          await insertSubscription(sub.url, sub.name, sub.id)
        }

        // C. Reload and set active state
        const updatedLocal = await getLocalSubscriptions()
        setSubs(updatedLocal)

        // D. If the currently selected subscription was deleted, reset selected subscription key
        const currentSelectedId = await getStoreValue(SSI_STORE_KEY)
        if (currentSelectedId && !remoteIds.includes(currentSelectedId)) {
          if (remoteIds.length > 0) {
            await setStoreValue(SSI_STORE_KEY, remoteIds[0])
          } else {
            await setStoreValue(SSI_STORE_KEY, '')
          }
          await syncActiveConnectionConfig("sync-cleanup")
        }
      }
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
  const remainingText = subsLoading || !hasSub
    ? "--"
    : (remainingBytes >= ONE_TB_BYTES
        ? `${(remainingBytes / ONE_TB_BYTES).toFixed(2)} TB`
        : `${(remainingBytes / ONE_GB_BYTES).toFixed(1)}`)
  const expireText = hasSub && sub.expire_time ? formatDate(sub.expire_time) : "--"
  const remainingUnit = remainingText === "--" || remainingText.includes("TB") ? "" : "GB"
  const remainingPercent = hasSub && trafficTotal > 0 ? Math.min(100, (remainingBytes / trafficTotal) * 100) : 0
  const ringCircumference = 2 * Math.PI * 42

  return (
    <div className="flex flex-col w-full h-full animate-fade-in">
      <MobileTopBar
        left={
          <button
            onClick={() => navigate("/dashboard/about")}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-text-secondary hover:text-text hover:bg-surface-active/60 transition-colors cursor-pointer"
            aria-label="About"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          </button>
        }
        right={
          <button
            onClick={() => navigate("/dashboard/profile")}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-text-secondary hover:text-text hover:bg-surface-active/60 transition-colors cursor-pointer"
            aria-label="Profile"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </button>
        }
      />

      {/* Full-screen flat layout: top stats · middle ball (fills height) · bottom controls */}
      <div className="flex-1 flex flex-col px-4 pb-6 min-h-0">
        {/* Top status card — remaining traffic ring + expiry */}
        <div className="bg-surface backdrop-blur-xl border border-border rounded-[20px] p-4 shadow-glass flex items-center gap-4 mt-4">
          {/* Circular progress ring (green → yellow) with remaining in center */}
          <div className="flex flex-col items-center shrink-0">
            <div className="relative w-20 h-20">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <defs>
                  <linearGradient id="trafficGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#34D399" />
                    <stop offset="100%" stopColor="#FBBF24" />
                  </linearGradient>
                </defs>
                <circle cx="50" cy="50" r="42" fill="none" strokeWidth="7" stroke="currentColor" className="text-text-muted/25" />
                <circle
                  cx="50" cy="50" r="42" fill="none" stroke="url(#trafficGrad)" strokeWidth="7" strokeLinecap="round"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringCircumference * (1 - remainingPercent / 100)}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[13px] font-extrabold text-text tabular-nums leading-none">{remainingText}</span>
                {remainingUnit && <span className="text-[8px] text-text-muted mt-0.5">{remainingUnit}</span>}
              </div>
            </div>
            <div className="text-[10px] text-text-muted mt-1.5">{l("Remaining", "剩余流量")}</div>
          </div>

          <div className="w-px h-16 bg-border-glass/40 shrink-0" />

          {/* Expiry */}
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <div className="text-[10px] text-text-muted">{l("Expire", "到期时间")}</div>
            <div className="text-base font-bold text-text tabular-nums leading-tight">{expireText}</div>
          </div>
        </div>

        {/* Middle: status text + connection ball — fills the vertical space */}
        <div className="flex-1 flex flex-col items-center justify-center gap-4 min-h-0">
          <div className="text-xs text-text-muted">
            {!isConnected && !isConnecting
              ? l("Tap the button below to connect", "点击下方按钮连接")
              : isConnecting
                ? l("Connecting…", "连接中…")
                : l("Connected", "已连接")}
          </div>

          <div className="relative w-56 h-56 flex items-center justify-center">
            {/* Outermost faint thin ring */}
            <div className="absolute inset-2 rounded-full border border-secondary/10 bg-secondary/[0.01]" />
            {/* Inner faint ring */}
            <div className="absolute inset-6 rounded-full border border-secondary/5" />

            {/* Gradient circular ring container */}
            <div className="absolute w-40 h-40 rounded-full">
              {/* Shadcn-style spinner ring during connecting */}
              {isConnecting && (
                <div className="absolute inset-0 rounded-full border-[6px] border-[#8E99FF]/20 border-t-[#8E99FF] animate-spin" />
              )}
              <div
                className={`absolute inset-0 rounded-full p-[8px] transition-all duration-500 bg-gradient-to-br ${
                  isConnected
                    ? "from-secondary to-[#8E99FF] shadow-lg shadow-secondary/15"
                    : isConnecting
                    ? "from-secondary/10 to-accent-purple/10"
                    : "shadow-sm"
                }`}
                style={isConnected ? undefined : !isConnecting ? { backgroundImage: 'linear-gradient(135deg, var(--ring-from), var(--ring-to))' } : undefined}
              >
                <div className="w-full h-full rounded-full bg-white dark:bg-bg-alt" />
              </div>

              {/* Central solid white / dark bg circle */}
              <div className="absolute inset-[8px] rounded-full bg-white dark:bg-bg-alt flex items-center justify-center shadow-inner overflow-hidden">
                <button
                  onClick={handleToggleConnection}
                  disabled={!canToggleConnection}
                  className="w-full h-full rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 active:scale-95 z-10 focus:outline-none"
                >
                  <div
                    className={`transition-all duration-300 ${
                      isConnected
                        ? "text-secondary scale-105"
                        : "hover:text-secondary hover:scale-105"
                    }`}
                    style={!isConnected ? { color: 'var(--power-icon-color)' } : undefined}
                  >
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                      <line x1="12" y1="2" x2="12" y2="12" />
                    </svg>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom: node button + mode switch + links */}
        <div className="flex flex-col gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate("/dashboard/nodes")}
            className="w-full flex items-center justify-between gap-2 bg-surface-active/25 rounded-xl px-4 py-3 hover:bg-surface-active/40 transition-colors text-left cursor-pointer"
            title={l("Open Nodes", "打开节点列表")}
          >
            <div className="flex items-center gap-3 min-w-0 flex-[6]">
              <div className="w-8 h-8 rounded-xl bg-surface-active flex items-center justify-center border border-border-glass/40 text-text-secondary shrink-0">
                <span className="text-base select-none">{currentNode ? currentNode.flag : "🌐"}</span>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-xs font-bold text-text truncate" title={currentNode ? currentNode.loc : undefined}>
                  {currentNode ? currentNode.loc : l("No Node Selected", "未选择任何节点")}
                </h3>
                <p className="text-[10px] text-text-muted truncate">
                  {isConnected ? l("Connected Node", "已连接节点") : l("Selected Node", "预选节点")}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end flex-[4] min-w-0">
              {currentNode ? (
                renderPing(activeNodePing)
              ) : (
                <span className="text-xs font-mono font-bold text-text-muted/60 select-none">--</span>
              )}
            </div>
          </button>

          {/* Mode switch (Smart Routing / Virtual NIC) */}
          <div className="bg-surface-active/40 border border-border-glass rounded-xl p-1 flex gap-1 max-w-[260px] mx-auto w-full">
            <button
              onClick={() => handleSwitchMode('rule')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-extrabold text-[11px] tracking-wide transition-all ${
                proxyMode === 'rule'
                  ? 'glass-active-pill'
                  : 'text-text-muted hover:text-text hover:bg-surface-active/50'
              }`}
            >
              <I.Activity />
              <span>{l("Smart Routing", "智能分流")}</span>
            </button>

            <button
              onClick={() => handleSwitchMode('tun')}
              disabled={isInstallingService}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-extrabold text-[11px] tracking-wide transition-all ${
                isInstallingService
                  ? 'text-text-muted/50 cursor-wait'
                  : proxyMode === 'tun'
                    ? 'glass-active-pill'
                    : 'text-text-muted hover:text-text hover:bg-surface-active/50'
              }`}
            >
              {isInstallingService ? (
                <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <I.Globe />
              )}
              <span>{isInstallingService ? l("Installing...", "安装中...") : l("Virtual NIC", "虚拟网卡")}</span>
            </button>
          </div>

          {/* Bottom links: official website + about */}
          <div className="flex items-center justify-center gap-8 pt-1 mt-8">
            <button
              onClick={() => openUrl("https://github.com/BadKid90s/AureStream")}
              className="flex items-center gap-1.5 text-[11px] text-text-muted hover:text-text transition-colors cursor-pointer"
            >
              <I.Globe /> {l("Official Website", "官方网站")}
            </button>
            <button
              onClick={() => navigate("/dashboard/about")}
              className="flex items-center gap-1.5 text-[11px] text-text-muted hover:text-text transition-colors cursor-pointer"
            >
              <I.Info /> {l("About", "关于本软件")}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}