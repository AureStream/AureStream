import type { EngineState } from "@/types/engine-state"

export type NetworkInfoRefreshReason = "connected" | "disconnected" | "node-switched"

let refreshVersion = 0
let consumedVersion = 0
const refreshListeners = new Set<() => void>()

export function shouldRefreshNetworkInfoOnEngineState(
  previous: EngineState["kind"] | null,
  current: EngineState["kind"],
): boolean {
  if (previous === null) return current === "running"
  if (previous === current) return false

  const connected = previous !== "running" && current === "running"
  const disconnected = previous !== "idle" && current === "idle"
  return connected || disconnected
}

export function shouldAllowConnectionToggle(
  engineKind: EngineState["kind"],
  localConnecting: boolean,
): boolean {
  if (engineKind === "running") return true
  return !localConnecting && engineKind !== "starting" && engineKind !== "stopping"
}

export function requestNetworkInfoRefresh(_reason: NetworkInfoRefreshReason): void {
  refreshVersion += 1
  refreshListeners.forEach((listener) => listener())
}

export function consumePendingNetworkInfoRefreshVersion(): number | null {
  if (refreshVersion === consumedVersion) return null
  consumedVersion = refreshVersion
  return consumedVersion
}

export function subscribeNetworkInfoRefresh(listener: () => void): () => void {
  refreshListeners.add(listener)
  return () => {
    refreshListeners.delete(listener)
  }
}
