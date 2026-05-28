import { useState, useEffect, useCallback } from "react"
import { getDataBaseInstance } from "@/single/db"
import type { Subscription, SubscriptionConfig } from "@/types/definition"
import type { ProxyNode } from "@/types/engine-state"

export function useSubscriptions() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [activeConfig, setActiveConfig] = useState<SubscriptionConfig | null>(
    null
  )
  const [nodes, setNodes] = useState<ProxyNode[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const db = await getDataBaseInstance()
      const rows = await db.select<Subscription[]>(
        "SELECT * FROM subscriptions ORDER BY id DESC"
      )
      setSubscriptions(rows)

      if (rows.length > 0) {
        const active = rows[0]
        const configs = await db.select<SubscriptionConfig[]>(
          "SELECT * FROM subscription_configs WHERE identifier = $1",
          [active.identifier]
        )
        if (configs.length > 0) {
          setActiveConfig(configs[0])
          const parsed = parseNodes(configs[0].config_content)
          setNodes(parsed)
        }
      }
    } catch (err) {
      console.error("Failed to load subscriptions:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { subscriptions, activeConfig, nodes, loading, refresh }
}

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
