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

  const localById = new Map(localList.map((sub) => [sub.id, sub]))

  for (const sub of remoteSubs) {
    if (localIds.has(sub.id)) {
      // API list is source of truth for traffic / expiry / name.
      await deps.updateLocalSubscriptionMeta(sub)
      // Re-download when remote URL changed (e.g. test override / plan rotate).
      const local = localById.get(sub.id)
      if (local && local.url !== sub.url) {
        const inserted = await deps.insertSubscription(sub.url, sub.name, sub.id)
        if (inserted) {
          await deps.updateLocalSubscriptionMeta(sub)
        }
      }
    } else {
      const inserted = await deps.insertSubscription(sub.url, sub.name, sub.id)
      // insertSubscription seeds traffic from subscription-userinfo headers;
      // always overlay API billing metadata when the download succeeded.
      if (inserted) {
        await deps.updateLocalSubscriptionMeta(sub)
      }
    }
  }

  const updatedLocal = await deps.getLocalSubscriptions()
  const localIdSet = new Set(updatedLocal.map((sub) => sub.id))
  // Prefer remote order, but only select ids that actually landed in SQLite
  // (failed config downloads leave a remote id without local config).
  const selectableIds = remoteIds.filter((id) => localIdSet.has(id))
  const fallbackId = selectableIds[0] ?? updatedLocal[0]?.id ?? ""

  const currentSelectedId = await deps.getSelectedSubscriptionId()
  const selectedIsValid =
    typeof currentSelectedId === "string" &&
    !!currentSelectedId &&
    localIdSet.has(currentSelectedId)

  if (!selectedIsValid) {
    await deps.setSelectedSubscriptionId(fallbackId)
    if (fallbackId) {
      await deps.syncActiveConnectionConfig("sync-cleanup")
    }
  }

  return updatedLocal
}
