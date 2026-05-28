import { invoke } from "@tauri-apps/api/core"
import type { EngineState } from "@/types/engine-state"

export type ProxyMode = "SystemProxy" | "ManualProxy" | "IntoProxy"

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

export async function isRunning(secret: string): Promise<boolean> {
  return invoke("is_running", { secret })
}

export async function clearEngineError(): Promise<void> {
  return invoke("clear_engine_error")
}

export async function readLogs(isError: boolean): Promise<string> {
  return invoke("read_logs", { isError })
}

export async function getAppVersion(): Promise<string> {
  return invoke("get_app_version")
}

export async function getLanIp(): Promise<string> {
  return invoke("get_lan_ip")
}

export async function pingGoogle(): Promise<boolean> {
  return invoke("ping_google")
}

export async function prestartCheck(
  port?: number
): Promise<{ port_occupied: boolean; orphan_pids: number[] }> {
  return invoke("prestart_check", { port: port ?? null })
}

export async function killOrphans(
  port?: number
): Promise<{
  success: boolean
  killed_pids: number[]
  port_released: boolean
  message: string
}> {
  return invoke("kill_orphans", { port: port ?? null })
}
