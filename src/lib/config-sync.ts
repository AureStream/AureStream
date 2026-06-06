import { invoke } from "@tauri-apps/api/core"

import { getConfigJsonPath } from "@/lib/app-paths"
import {
  isConnectionConfigFresh,
  mergeConnectionConfig,
} from "@/lib/connection-config"
import { hotReloadConnectionConfig, isEngineRunning } from "@/lib/hot-reload-config"
import { onConnectionConfigStale } from "@/lib/merge-cache"
import { perf } from "@/lib/perf"
import {
  ROUTING_MODE_KEY,
  normalizeRoutingMode,
  type RoutingMode,
} from "@/lib/routing-mode"
import { getEnableTun, getStoreValue } from "@/single/store"
import { SSI_STORE_KEY } from "@/types/definition"

export type ConnectionConfigParams = {
  subscriptionIdentifier: string
  routingMode: RoutingMode
  enableTun: boolean
}

const DEBOUNCE_MS = 200

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let inFlightSync: Promise<boolean> | null = null

export async function resolveActiveConnectionConfigParams(): Promise<ConnectionConfigParams | null> {
  const subscriptionIdentifier = (await getStoreValue(
    SSI_STORE_KEY,
    ""
  )) as string
  if (!subscriptionIdentifier) {
    return null
  }

  const routingMode = normalizeRoutingMode(
    await getStoreValue(ROUTING_MODE_KEY, "rule")
  )
  const enableTun = await getEnableTun()
  return { subscriptionIdentifier, routingMode, enableTun }
}

async function runSync(
  params: ConnectionConfigParams,
  options: { force?: boolean; reason?: string } = {}
): Promise<boolean> {
  if (inFlightSync) {
    return inFlightSync
  }

  const { force, reason } = options
  inFlightSync = perf.run(
    reason ? `config-sync.merge:${reason}` : "config-sync.merge",
    async () => {
      try {
        if (await isEngineRunning()) {
          await hotReloadConnectionConfig(
            params.subscriptionIdentifier,
            params.routingMode,
            params.enableTun
          )
          return true
        }

        const merged = await mergeConnectionConfig(
          params.subscriptionIdentifier,
          params.routingMode,
          params.enableTun,
          { force }
        )
        if (merged) {
          const configPath = await getConfigJsonPath()
          await invoke("mark_config_verified", { configPath })
        }
        if (reason) {
          console.info(
            `[config-sync] ${reason}${merged ? " (rewrote config)" : " (unchanged)"}`
          )
        }
        return merged
      } finally {
        inFlightSync = null
      }
    }
  )

  return inFlightSync
}

/** Merge config for the active subscription immediately (load, switch, explicit changes). */
export async function syncActiveConnectionConfig(
  reason?: string
): Promise<boolean> {
  const params = await resolveActiveConnectionConfigParams()
  if (!params) {
    return false
  }
  return runSync(params, { reason })
}

/** Debounced background merge after settings inputs change. */
export function scheduleConfigSync(reason?: string): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    void syncActiveConnectionConfig(reason).catch((err) => {
      console.error("[config-sync] scheduled sync failed:", err)
    })
  }, DEBOUNCE_MS)
}

/**
 * Connect-time guard: config is pre-merged on input changes; only waits for in-flight
 * work or runs a rare fallback merge when inputs changed right before connect.
 */
export async function ensureConnectionConfigReady(
  subscriptionIdentifier: string,
  routingMode: RoutingMode,
  enableTun: boolean
): Promise<void> {
  if (await isConnectionConfigFresh(subscriptionIdentifier, routingMode, enableTun)) {
    return
  }

  if (inFlightSync) {
    await inFlightSync
    if (await isConnectionConfigFresh(subscriptionIdentifier, routingMode, enableTun)) {
      return
    }
  }

  await runSync(
    { subscriptionIdentifier, routingMode, enableTun },
    { force: true, reason: "connect-fallback" }
  )
}

onConnectionConfigStale(() => {
  scheduleConfigSync("inputs-changed")
})
