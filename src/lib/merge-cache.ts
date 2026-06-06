let lastMergeCacheKey: string | null = null
const staleListeners = new Set<() => void>()

export function getLastMergeCacheKey(): string | null {
  return lastMergeCacheKey
}

export function setLastMergeCacheKey(key: string): void {
  lastMergeCacheKey = key
}

export function onConnectionConfigStale(listener: () => void): () => void {
  staleListeners.add(listener)
  return () => {
    staleListeners.delete(listener)
  }
}

export function invalidateConnectionConfigCache(): void {
  lastMergeCacheKey = null
  for (const listener of staleListeners) {
    listener()
  }
}
