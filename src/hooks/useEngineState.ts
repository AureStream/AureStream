import { useState, useEffect, useCallback } from "react"
import { listen } from "@tauri-apps/api/event"
import type { EngineState } from "@/types/engine-state"
import { getEngineState, startEngine, stopEngine, clearEngineError } from "@/utils/vpn-service"
import type { ProxyMode } from "@/utils/vpn-service"

const INITIAL_STATE: EngineState = { kind: "idle", epoch: 0 }

export function useEngineState() {
  const [engineState, setEngineState] = useState<EngineState>(INITIAL_STATE)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let unlisten: (() => void) | undefined

    getEngineState()
      .then((state) => {
        setEngineState(state)
      })
      .catch((err) => {
        console.error("Failed to get engine state:", err)
      })
      .finally(() => setLoading(false))

    listen<EngineState>("engine-state", (event) => {
      setEngineState(event.payload)
    }).then((fn) => {
      unlisten = fn
    })

    return () => {
      unlisten?.()
    }
  }, [])

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
