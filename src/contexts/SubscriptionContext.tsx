import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { getDataBaseInstance } from "@/single/db"
import { getStoreValue, setStoreValue, getEnableTun } from "@/single/store"
import { requireEngineIdle } from "@/lib/require-engine-idle"
import { AUTO_UPDATE_STORE_KEY, UPDATE_INTERVAL_STORE_KEY, INTERVAL_SECONDS, SSI_STORE_KEY } from "@/types/definition"
import type { Subscription, SubscriptionConfig, UpdateInterval } from "@/types/definition"
import type { ProxyNode } from "@/types/engine-state"
import { updateSubscription } from "@/action/db"
import { getEngineState } from "@/utils/vpn-service"
import { mergeConnectionConfig } from "@/lib/connection-config"
import { ROUTING_MODE_KEY, normalizeRoutingMode } from "@/lib/routing-mode"

const NON_PROXY_OUTBOUND_TYPES = new Set([
  "selector",
  "urltest",
  "direct",
  "block",
  "dns",
])
export type SubscriptionContextValue = {
  subscriptions: Subscription[]
  activeIdentifier: string
  activeConfig: SubscriptionConfig | null
  nodes: ProxyNode[]
  loading: boolean
  refresh: () => Promise<void>
  /** Returns false if switch was blocked (e.g. engine running). */
  selectSubscription: (identifier: string) => Promise<boolean>
  /** Returns false if engine is busy (shows warning). */
  requireIdleForMutation: () => Promise<boolean>
}

const SubscriptionContext = createContext<SubscriptionContextValue | undefined>(
  undefined
)

function parseNodes(configContent: string): ProxyNode[] {
  try {
    const config = JSON.parse(configContent)
    const outbounds = config.outbounds ?? []
    const seenTags = new Set<string>()
    return outbounds
      .filter(
        (o: Record<string, unknown>) => {
          const type = typeof o.type === "string" ? o.type : ""
          const tag = typeof o.tag === "string" ? o.tag : ""
          if (!tag || NON_PROXY_OUTBOUND_TYPES.has(type)) return false
          if (seenTags.has(tag)) return false
          seenTags.add(tag)
          return true
        }
      )
      .map((o: Record<string, unknown>, i: number) => ({
        id: String(i),
        name: (o.tag as string) ?? `Node ${i}`,
        host: (o.server as string) ?? "",
        port: (o.server_port as number) ?? 0,
        latencyLabel: "未测速",
      }))
  } catch {
    return []
  }
}

async function loadActiveSubscription(
  activeId: string
): Promise<{
  activeConfig: SubscriptionConfig | null
  nodes: ProxyNode[]
}> {
  const db = await getDataBaseInstance()
  const configs = await db.select<SubscriptionConfig[]>(
    "SELECT * FROM subscription_configs WHERE identifier = $1",
    [activeId]
  )
  if (configs.length > 0) {
    return {
      activeConfig: configs[0],
      nodes: parseNodes(configs[0].config_content),
    }
  }
  return { activeConfig: null, nodes: [] }
}

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [activeIdentifier, setActiveIdentifier] = useState("")
  const [activeConfig, setActiveConfig] = useState<SubscriptionConfig | null>(
    null
  )
  const [nodes, setNodes] = useState<ProxyNode[]>([])
  const [loading, setLoading] = useState(true)

  const applyActiveId = useCallback(async (activeId: string) => {
    const { activeConfig: cfg, nodes: parsed } =
      await loadActiveSubscription(activeId)
    setActiveIdentifier(activeId)
    setActiveConfig(cfg)
    setNodes(parsed)
    window.dispatchEvent(
      new CustomEvent("active-subscription-changed", {
        detail: { identifier: activeId },
      })
    )
  }, [])

  const selectSubscription = useCallback(
    async (identifier: string): Promise<boolean> => {
      if (identifier === activeIdentifier) return true
      if (!(await requireEngineIdle())) return false
      await setStoreValue(SSI_STORE_KEY, identifier)
      await applyActiveId(identifier)
      return true
    },
    [activeIdentifier, applyActiveId]
  )

  const requireIdleForMutation = useCallback(
    () => requireEngineIdle(),
    []
  )

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const db = await getDataBaseInstance()
      const rows = await db.select<Subscription[]>(
        "SELECT * FROM subscriptions ORDER BY id DESC"
      )
      setSubscriptions(rows)

      if (rows.length > 0) {
        let activeId = (await getStoreValue(SSI_STORE_KEY)) as string | undefined
        let activeSub = rows.find((r) => r.identifier === activeId)
        if (!activeSub) {
          activeSub = rows[0]
          activeId = activeSub.identifier
          await setStoreValue(SSI_STORE_KEY, activeId)
        }
        await applyActiveId(activeSub.identifier)
      } else {
        setActiveIdentifier("")
        setActiveConfig(null)
        setNodes([])
      }
    } catch (err) {
      console.error("Failed to load subscriptions:", err)
    } finally {
      setLoading(false)
    }
  }, [applyActiveId])

  useEffect(() => {
    refresh()
  }, [refresh])

  // ── Auto-update timer ────────────────────────────────────────────────
  const activeIdentifierRef = useRef(activeIdentifier)
  useEffect(() => { activeIdentifierRef.current = activeIdentifier }, [activeIdentifier])

  useEffect(() => {
    const CHECK_INTERVAL_MS = 10 * 60 * 1000 // every 10 minutes

    const runAutoUpdateCycle = async () => {
      try {
        const enabled = await getStoreValue(AUTO_UPDATE_STORE_KEY, false)
        if (!enabled) return

        const intervalStr = (await getStoreValue(UPDATE_INTERVAL_STORE_KEY, "24h")) as UpdateInterval
        const intervalSec = INTERVAL_SECONDS[intervalStr] ?? INTERVAL_SECONDS["24h"]
        const now = Math.floor(Date.now() / 1000)

        const db = await getDataBaseInstance()
        const subs = await db.select<Subscription[]>(
          "SELECT * FROM subscriptions ORDER BY id DESC"
        )

        let activeWasUpdated = false
        const currentActive = activeIdentifierRef.current

        for (const sub of subs) {
          if (now - sub.last_update_time >= intervalSec) {
            const ok = await updateSubscription(sub.identifier)
            if (ok && sub.identifier === currentActive) {
              activeWasUpdated = true
            }
          }
        }

        // Refresh the UI state with updated data
        const rows = await db.select<Subscription[]>(
          "SELECT * FROM subscriptions ORDER BY id DESC"
        )
        setSubscriptions(rows)

        if (currentActive) {
          await applyActiveId(currentActive)
        }

        // If the active subscription was updated and engine is running, hot-reload config
        if (activeWasUpdated && currentActive) {
          const state = await getEngineState()
          if (state.kind === "running") {
            try {
              const routingRaw = await getStoreValue(ROUTING_MODE_KEY, "rule")
              const routingMode = normalizeRoutingMode(routingRaw)
              const enableTun = await getEnableTun()
              await mergeConnectionConfig(currentActive, routingMode, enableTun)
              const { invoke } = await import("@tauri-apps/api/core")
              await invoke("reload_config")
              console.log("[auto-update] config reloaded for active subscription while connected")
            } catch (e) {
              console.error("[auto-update] config reload failed:", e)
            }
          }
        }
      } catch (err) {
        console.error("[auto-update] cycle failed:", err)
      }
    }

    // Run once on mount
    runAutoUpdateCycle()

    const timer = setInterval(runAutoUpdateCycle, CHECK_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [applyActiveId])

  return (
    <SubscriptionContext.Provider
      value={{
        subscriptions,
        activeIdentifier,
        activeConfig,
        nodes,
        loading,
        refresh,
        selectSubscription,
        requireIdleForMutation,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  )
}

export function useSubscriptionContext() {
  const context = useContext(SubscriptionContext)
  if (context === undefined) {
    throw new Error(
      "useSubscriptionContext must be used within a SubscriptionProvider"
    )
  }
  return context
}
