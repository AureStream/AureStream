import type { EngineState } from "@/types/engine-state"

export const ENGINE_BUSY_MESSAGE = "请先断开连接后再进行此操作"

export function isEngineBusy(state: EngineState): boolean {
  return (
    state.kind === "running" ||
    state.kind === "starting" ||
    state.kind === "stopping"
  )
}

export function isEngineIdle(state: EngineState): boolean {
  return state.kind === "idle" || state.kind === "failed"
}
