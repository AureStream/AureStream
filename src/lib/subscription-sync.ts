import type { Subscription } from "../api/subscriptions"

export type LocalSubscription = {
  id: string
  name: string
  url: string
  traffic_used: number
  traffic_total: number
  expire_time: number
  created_at: number
}

export interface SubscriptionSyncDeps {
  fetchSubscriptions: () => Promise<Subscription[]>
  getLocalSubscriptions: () => Promise<LocalSubscription[]>
  deleteSubscription: (id: string) => Promise<void>
  insertSubscription: (
    url: string,
    name?: string,
    customIdentifier?: string
  ) => Promise<string | undefined>
  updateLocalSubscriptionMeta: (sub: Subscription) => Promise<void>
  getSelectedSubscriptionId: () => Promise<unknown>
  setSelectedSubscriptionId: (id: string) => Promise<void>
  syncActiveConnectionConfig: (reason?: string) => Promise<unknown>
}

/**
 * Syncs the remote subscription list into SQLite.
 * Existing local configs are metadata-updated only (no re-download).
 * New remotes are inserted (downloads config once).
 */
export async function syncRemoteSubscriptionsToLocal(
  deps: SubscriptionSyncDeps
): Promise<LocalSubscription[]> {
  const remoteSubs = await deps.fetchSubscriptions()
  if (!Array.isArray(remoteSubs)) {
    return deps.getLocalSubscriptions()
  }

  const remoteIds = remoteSubs.map((sub) => sub.id)
  const localList = await deps.getLocalSubscriptions()
  const localIds = new Set(localList.map((sub) => sub.id))

  for (const local of localList) {
    if (!remoteIds.includes(local.id)) {
      await deps.deleteSubscription(local.id)
    }
  }

  for (const sub of remoteSubs) {
    if (localIds.has(sub.id)) {
      await deps.updateLocalSubscriptionMeta(sub)
    } else {
      await deps.insertSubscription(sub.url, sub.name, sub.id)
    }
  }

  const updatedLocal = await deps.getLocalSubscriptions()

  const currentSelectedId = await deps.getSelectedSubscriptionId()
  if (
    typeof currentSelectedId === "string" &&
    currentSelectedId &&
    !remoteIds.includes(currentSelectedId)
  ) {
    await deps.setSelectedSubscriptionId(remoteIds[0] ?? "")
    if (remoteIds.length > 0) {
      await deps.syncActiveConnectionConfig("sync-cleanup")
    }
  } else if (
    (!currentSelectedId || typeof currentSelectedId !== "string") &&
    remoteIds.length > 0
  ) {
    await deps.setSelectedSubscriptionId(remoteIds[0])
  }

  return updatedLocal
}
