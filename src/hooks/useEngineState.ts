import { useCallback, useSyncExternalStore } from "react"
import { listen } from "@tauri-apps/api/event"
import type { EngineState } from "@/types/engine-state"
import { getEngineState, startEngine, stopEngine, clearEngineError } from "@/utils/vpn-service"
import type { ProxyMode } from "@/utils/vpn-service"

const INITIAL_STATE: EngineState = { kind: "idle", epoch: 0 }

type EngineSnapshot = {
  engineState: EngineState
  loading: boolean
}

let snapshot: EngineSnapshot = {
  engineState: INITIAL_STATE,
  loading: true,
}
let subscriptionStarted = false
let unlistenEngineState: (() => void) | undefined
const subscribers = new Set<() => void>()

function publish(next: Partial<EngineSnapshot>) {
  snapshot = { ...snapshot, ...next }
  subscribers.forEach((notify) => notify())
}

function ensureEngineSubscription() {
  if (subscriptionStarted) return
  subscriptionStarted = true

  getEngineState()
    .then((state) => publish({ engineState: state }))
    .catch((err) => {
      console.error("Failed to get engine state:", err)
    })
    .finally(() => publish({ loading: false }))

  listen<EngineState>("engine-state", (event) => {
    publish({ engineState: event.payload, loading: false })
  }).then((unlisten) => {
    unlistenEngineState = unlisten
  }).catch((err) => {
    console.error("Failed to subscribe to engine state:", err)
  })
}

function subscribeToEngineSnapshot(onStoreChange: () => void) {
  subscribers.add(onStoreChange)
  ensureEngineSubscription()
  return () => {
    subscribers.delete(onStoreChange)
  }
}

function getEngineSnapshot() {
  return snapshot
}

export function useEngineState() {
  const { engineState, loading } = useSyncExternalStore(
    subscribeToEngineSnapshot,
    getEngineSnapshot,
    getEngineSnapshot
  )

  const start = useCallback(
    async (configPath: string, mode: ProxyMode = "SystemProxy") => {
      await startEngine(configPath, mode)
    },
    []
  )

  const stop = useCallback(async () => {
    await stopEngine()
  }, [])

  const clearError = useCallback(async () => {
    await clearEngineError()
  }, [])

  const isRunning = engineState.kind === "running"
  const isStarting = engineState.kind === "starting"
  const isStopping = engineState.kind === "stopping"
  const isFailed = engineState.kind === "failed"
  const isIdle = engineState.kind === "idle"
  const isConnected = isRunning || isStopping

  return {
    engineState,
    loading,
    isRunning,
    isStarting,
    isStopping,
    isFailed,
    isIdle,
    isConnected,
    start,
    stop,
    clearError,
  }
}
