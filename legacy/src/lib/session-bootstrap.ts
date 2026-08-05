import { fetchSubscriptions } from "../api/subscriptions"
import {
  deleteSubscription,
  getLocalSubscriptions,
  insertSubscription,
  updateLocalSubscriptionMeta,
} from "../action/db"
import { getStoreValue, setStoreValue } from "../single/store"
import { SSI_STORE_KEY } from "../types/definition"
import { syncActiveConnectionConfig } from "./config-sync"
import { syncRemoteSubscriptionsToLocal } from "./subscription-sync"

export type SessionBootstrapMode = "login" | "restore"

const BOOTSTRAP_FRESH_MS = 5_000

let bootstrapGeneration = 0
let lastBootstrapCompletedAt = 0
let lastBootstrapGeneration = 0

/** In-flight or completed restore for the current generation (StrictMode-safe). */
let restoreByGeneration: { generation: number; promise: Promise<void> } | null = null

export function resetSessionBootstrapState(): void {
  bootstrapGeneration += 1
  lastBootstrapCompletedAt = 0
  lastBootstrapGeneration = 0
  restoreByGeneration = null
}

/** True when a successful bootstrap finished recently (home can skip a second full sync). */
export function isBootstrapDataFresh(withinMs: number = BOOTSTRAP_FRESH_MS): boolean {
  if (lastBootstrapCompletedAt <= 0) return false
  if (lastBootstrapGeneration !== bootstrapGeneration) return false
  return Date.now() - lastBootstrapCompletedAt < withinMs
}

function markBootstrapComplete(generation: number): void {
  if (generation !== bootstrapGeneration) return
  lastBootstrapCompletedAt = Date.now()
  lastBootstrapGeneration = generation
}

async function runBootstrapWork(mode: SessionBootstrapMode, generation: number): Promise<void> {
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

  if (generation !== bootstrapGeneration) {
    return
  }

  if (mode === "login" && updatedLocal.length === 0) {
    // Either the account has no plans, or every config download failed.
    throw new Error("当前账号没有可用订阅或订阅配置拉取失败")
  }

  const reason = mode === "login" ? "login-init" : "session-restore"
  // Await merge so sessionReady implies config.json is ready for connect.
  // Restore failures are non-fatal (local cache may still paint; connect retries).
  try {
    await syncActiveConnectionConfig(reason)
  } catch (error) {
    console.error(`[session-bootstrap] config sync failed (${reason}):`, error)
    if (mode === "login") {
      throw error instanceof Error
        ? error
        : new Error("连接配置生成失败，请重试")
    }
  }

  markBootstrapComplete(generation)
}

/**
 * Loads remote subscriptions into SQLite, ensures SSI, and merges connection config.
 * - login: caller must clear local user data first; empty remote list is an error
 * - restore: coalesces concurrent/completed calls within the same generation (StrictMode)
 */
export async function bootstrapSessionData(mode: SessionBootstrapMode): Promise<void> {
  const generation = bootstrapGeneration

  if (mode === "restore") {
    if (restoreByGeneration && restoreByGeneration.generation === generation) {
      return restoreByGeneration.promise
    }
    const pending = runBootstrapWork(mode, generation)
    restoreByGeneration = { generation, promise: pending }
    try {
      await pending
    } catch (error) {
      // Allow a later restore attempt after failure in this generation.
      if (restoreByGeneration?.promise === pending) {
        restoreByGeneration = null
      }
      throw error
    }
    return
  }

  return runBootstrapWork(mode, generation)
}
