import { invoke } from "@tauri-apps/api/core"
import type { EngineState } from "@/types/engine-state"

export type ProxyMode = "SystemProxy" | "IntoProxy"

export async function startEngine(
  path: string,
  mode: ProxyMode = "SystemProxy"
): Promise<void> {
  return invoke("start", { path, mode })
}

export async function stopEngine(): Promise<void> {
  return invoke("stop")
}

export async function getEngineState(): Promise<EngineState> {
  return invoke("get_engine_state")
}

export async function clearEngineError(): Promise<void> {
  return invoke("clear_engine_error")
}

export async function switchProxyMode(
  path: string,
  mode: ProxyMode
): Promise<void> {
  return invoke("switch_proxy_mode", { path, mode })
}
