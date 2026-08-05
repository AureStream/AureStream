/**
 * Session + localStorage cache for node TCP latencies.
 *
 * Values: `> 0` = ms, `-1` = timeout/unreachable, `undefined` = not measured.
 */

const STORAGE_KEY = "aurestream.node-latencies.v1"

const cache = new Map<string, number>()
let hydrated = false
const listeners = new Set<() => void>()

function hydrateFromStorage() {
  if (hydrated) return
  hydrated = true
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const obj = JSON.parse(raw) as Record<string, number>
    for (const [tag, ms] of Object.entries(obj)) {
      if (tag && typeof ms === "number" && Number.isFinite(ms)) {
        cache.set(tag, ms)
      }
    }
  } catch {
    // ignore corrupt cache
  }
}

function persist() {
  try {
    const obj: Record<string, number> = {}
    for (const [tag, ms] of cache) {
      obj[tag] = ms
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj))
  } catch {
    // quota / private mode
  }
}

function notify() {
  for (const fn of listeners) {
    try {
      fn()
    } catch {
      // ignore listener errors
    }
  }
}

/** Subscribe to latency cache updates (e.g. after speed test). Returns unsubscribe. */
export function subscribeNodeLatencies(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getNodeLatency(tag: string): number | undefined {
  hydrateFromStorage()
  return cache.get(tag)
}

export function setNodeLatency(tag: string, ms: number): void {
  if (!tag) return
  hydrateFromStorage()
  cache.set(tag, ms)
  persist()
  notify()
}

export function clearNodeLatencies(): void {
  cache.clear()
  hydrated = true
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
  notify()
}

/** Snapshot of all known latencies (for bulk UI init). */
export function getAllNodeLatencies(): Map<string, number> {
  hydrateFromStorage()
  return new Map(cache)
}
