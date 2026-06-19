// Session-level latency cache shared across pages so measured node delays
// survive navigation (component unmount). Keyed by node tag.
//
// Values: > 0 = latency in ms, -1 = timeout/unreachable, 0/undefined = unknown.

const cache = new Map<string, number>()

export function getNodeLatency(tag: string): number | undefined {
  return cache.get(tag)
}

export function setNodeLatency(tag: string, ms: number): void {
  if (!tag) return
  cache.set(tag, ms)
}

export function clearNodeLatency(): void {
  cache.clear()
}
