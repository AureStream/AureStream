import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react"
import { formatUnknownError, useAlert } from "@/contexts/AlertContext"
import { useEngineState } from "@/hooks/useEngineState"
import {
  engineSelectNode,
  engineStart,
  engineStop,
  type EngineStatePayload,
} from "@/lib/ipc"

export type StartOptions = {
  nodeTag?: string
  mode?: "system" | "tun"
  smartRouting?: boolean
}

type EngineContextValue = {
  /** Source of truth from `engine-state` events (plus one-shot hydrate). */
  engine: EngineStatePayload
  start: (nodeTagOrOpts?: string | StartOptions) => Promise<void>
  stop: () => Promise<void>
  selectNode: (nodeTag: string) => Promise<void>
}

const EngineContext = createContext<EngineContextValue>({
  engine: { state: "idle", captureMode: "off" },
  start: async () => {},
  stop: async () => {},
  selectNode: async () => {},
})

export function useEngine() {
  return useContext(EngineContext)
}

/**
 * Thin command wrappers + event-driven state. UI must not invent a parallel FSM.
 * Failures surface via global error dialog (deduped).
 */
export function EngineProvider({ children }: { children: ReactNode }) {
  const engine = useEngineState()
  const { showError } = useAlert()
  const lastDialogKey = useRef<string | null>(null)

  const presentError = useCallback(
    (raw: unknown, fallback: string, title: string) => {
      const message = formatUnknownError(raw, fallback)
      const key = `${title}::${message}`
      if (lastDialogKey.current === key) return
      lastDialogKey.current = key
      showError(message, title)
    },
    [showError],
  )

  // Engine failed state (including tray-triggered starts) → dialog once per reason.
  useEffect(() => {
    if (engine.state === "running" || engine.state === "idle" || engine.state === "starting") {
      if (engine.state !== "starting") {
        lastDialogKey.current = null
      }
      return
    }
    if (engine.state !== "failed") return
    const reason = engine.reason?.trim() || "连接失败"
    presentError(reason, "连接失败", "连接失败")
  }, [engine.state, engine.reason, presentError])

  const start = useCallback(
    async (nodeTagOrOpts?: string | StartOptions) => {
      try {
        await engineStart(nodeTagOrOpts)
      } catch (err) {
        presentError(err, "连接失败", "连接失败")
      }
    },
    [presentError],
  )

  const stop = useCallback(async () => {
    try {
      await engineStop()
    } catch (err) {
      presentError(err, "断开失败", "断开失败")
    }
  }, [presentError])

  const selectNode = useCallback(
    async (nodeTag: string) => {
      try {
        await engineSelectNode(nodeTag)
      } catch (err) {
        presentError(err, "切换节点失败", "切换失败")
      }
    },
    [presentError],
  )

  return (
    <EngineContext.Provider value={{ engine, start, stop, selectNode }}>
      {children}
    </EngineContext.Provider>
  )
}
