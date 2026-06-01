import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { getDataBaseInstance } from "@/single/db"
import { getStoreValue, setStoreValue } from "@/single/store"
import { requireEngineIdle } from "@/lib/require-engine-idle"
import { SSI_STORE_KEY } from "@/types/definition"
import type { Subscription, SubscriptionConfig } from "@/types/definition"
import type { ProxyNode } from "@/types/engine-state"
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
    return outbounds
      .filter(
        (o: Record<string, unknown>) =>
          o.type === "vless" ||
          o.type === "vmess" ||
          o.type === "trojan" ||
          o.type === "shadowsocks"
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
