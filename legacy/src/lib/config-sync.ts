import { invoke } from "@tauri-apps/api/core"

import { getConfigJsonPath } from "@/lib/app-paths"
import {
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
let inFlightSync: { key: string; promise: Promise<boolean> } | null = null
let scheduledSyncSuspensionDepth = 0

function paramsKey(params: ConnectionConfigParams): string {
  return `${params.subscriptionIdentifier}|${params.routingMode}|${params.enableTun ? 1 : 0}`
}

export function cancelPendingConfigSync(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
}

export async function withScheduledConfigSyncSuspended<T>(
  work: () => Promise<T>
): Promise<T> {
  scheduledSyncSuspensionDepth += 1
  cancelPendingConfigSync()
  try {
    return await work()
  } finally {
    scheduledSyncSuspensionDepth -= 1
    cancelPendingConfigSync()
  }
}

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
  const key = paramsKey(params)
  const { force, reason } = options

  // Same params already merging: join that promise (unless force after it finishes).
  if (inFlightSync && inFlightSync.key === key && !force) {
    return inFlightSync.promise
  }

  // Different params (or forced): wait for the current merge, then run ours.
  if (inFlightSync) {
    await inFlightSync.promise.catch(() => false)
  }

  // Another waiter may have started an identical merge while we waited.
  if (inFlightSync && inFlightSync.key === key && !force) {
    return inFlightSync.promise
  }

  const entry: { key: string; promise: Promise<boolean> } = {
    key,
    promise: null as unknown as Promise<boolean>,
  }

  entry.promise = perf.run(
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
        if (inFlightSync === entry) {
          inFlightSync = null
        }
      }
    }
  )

  inFlightSync = entry
  return entry.promise
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
  if (scheduledSyncSuspensionDepth > 0) {
    return
  }
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
 * Connect-time guard: config is pre-merged on input changes.
 * Join an in-flight merge only when params match; otherwise wait and merge with
 * the requested connect params.
 */
export async function ensureConnectionConfigReady(
  subscriptionIdentifier: string,
  routingMode: RoutingMode,
  enableTun: boolean
): Promise<void> {
  const params: ConnectionConfigParams = {
    subscriptionIdentifier,
    routingMode,
    enableTun,
  }
  const key = paramsKey(params)

  if (inFlightSync && inFlightSync.key === key) {
    await inFlightSync.promise
    return
  }

  if (inFlightSync) {
    await inFlightSync.promise.catch(() => false)
  }

  await runSync(params, { force: true, reason: "connect-fallback" })
}

onConnectionConfigStale(() => {
  scheduleConfigSync("inputs-changed")
})
