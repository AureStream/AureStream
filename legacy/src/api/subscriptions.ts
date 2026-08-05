import { apiFetch } from "./client"

export interface Subscription {
  id: string
  name: string
  url: string
  traffic_used: number
  traffic_total: number
  expire_time: number
  created_at: number
}

export async function fetchSubscriptions(): Promise<Subscription[]> {
  const res = await apiFetch("/subscriptions")
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? "Failed to fetch subscriptions")
  }
  const data = await res.json()
  return data.subscriptions
}

export async function addSubscription(name: string, url: string): Promise<Subscription> {
  const res = await apiFetch("/subscriptions", {
    method: "POST",
    body: JSON.stringify({ name, url }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? "Failed to add subscription")
  }
  return res.json()
}

export async function deleteSubscription(id: string): Promise<void> {
  const res = await apiFetch(`/subscriptions/${id}`, { method: "DELETE" })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? "Failed to delete subscription")
  }
}

export async function reportUsage(id: string, uploadAddDownload: number): Promise<void> {
  await apiFetch(`/subscriptions/${id}/usage`, {
    method: "POST",
    body: JSON.stringify({ upload_add_download: uploadAddDownload }),
  }).catch(() => {}) // Fire-and-forget, don't block on errors
}
