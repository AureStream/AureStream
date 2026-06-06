import { invoke } from "@tauri-apps/api/core"

import { getConfigJsonPath } from "@/lib/app-paths"
import { mergeConnectionConfig } from "@/lib/connection-config"
import { invalidateConnectionConfigCache } from "@/lib/merge-cache"
import { perf } from "@/lib/perf"
import {
  ROUTING_MODE_KEY,
  normalizeRoutingMode,
  type RoutingMode,
} from "@/lib/routing-mode"
import { flushStore, getEnableTun, getStoreValue } from "@/single/store"
import { SSI_STORE_KEY } from "@/types/definition"
import { getEngineState } from "@/utils/vpn-service"
import { invalidateControllerClientCache } from "@/utils/singbox-api/controller-cache"

export async function isEngineRunning(): Promise<boolean> {
  const state = await getEngineState()
  return state.kind === "running"
}

/** Rebuild config.json and hot-reload sing-box without disconnecting. */
export async function hotReloadConnectionConfig(
  subscriptionIdentifier: string,
  routingMode?: RoutingMode,
  enableTun?: boolean
): Promise<void> {
  if (!subscriptionIdentifier) {
    throw new Error("subscription_identifier_missing")
  }

  await perf.run("hot-reload.total", async () => {
    invalidateConnectionConfigCache()

    const routing =
      routingMode ??
      normalizeRoutingMode(await getStoreValue(ROUTING_MODE_KEY, "rule"))
    const tun = enableTun ?? (await getEnableTun())

    const merged = await perf.run("hot-reload.merge", () =>
      mergeConnectionConfig(subscriptionIdentifier, routing, tun, { force: true })
    )
    if (merged) {
      const configPath = await getConfigJsonPath()
      await invoke("mark_config_verified", { configPath })
    }
    await flushStore()
    await perf.run("hot-reload.invoke", () => invoke("reload_config"))
  })

  invalidateControllerClientCache()
}

/** Hot-reload when engine is running; no-op when idle. Returns whether reload ran. */
export async function hotReloadIfRunning(
  subscriptionIdentifier?: string,
  routingMode?: RoutingMode,
  enableTun?: boolean
): Promise<boolean> {
  if (!(await isEngineRunning())) {
    return false
  }

  const identifier =
    subscriptionIdentifier ||
    ((await getStoreValue(SSI_STORE_KEY, "")) as string)
  if (!identifier) {
    return false
  }

  await hotReloadConnectionConfig(identifier, routingMode, enableTun)
  return true
}
