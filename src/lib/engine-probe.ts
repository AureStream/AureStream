import { invoke } from "@tauri-apps/api/core"

const PROBE_TTL_MS = 30_000

export type EngineServiceState = "missing" | "ready" | "unreachable"

let lastProbe: { state: EngineServiceState; at: number } | null = null

export function invalidateEngineProbeCache(): void {
  lastProbe = null
}

function parseProbeMessage(msg: string): EngineServiceState {
  if (msg.startsWith("installed_unreachable:")) {
    return "unreachable"
  }
  return "ready"
}

/** Cached cross-platform TUN/helper service probe (macOS helper, Windows SCM, Linux pkexec). */
export async function probeEngineServiceState(
  force = false
): Promise<EngineServiceState> {
  const now = Date.now()
  if (!force && lastProbe && now - lastProbe.at < PROBE_TTL_MS) {
    return lastProbe.state
  }

  try {
    const msg = (await invoke("engine_probe")) as string
    const state = parseProbeMessage(msg)
    lastProbe = { state, at: now }
    return state
  } catch {
    lastProbe = { state: "missing", at: now }
    return "missing"
  }
}

/** True when the platform service/helper is present (ready or unreachable). */
export async function probeEngineService(force = false): Promise<boolean> {
  const state = await probeEngineServiceState(force)
  return state !== "missing"
}

export async function ensureEngineServiceInstalled(): Promise<void> {
  await invoke("engine_ensure_installed")
  lastProbe = { state: "ready", at: Date.now() }
}

/** Uninstall the privileged service/helper (macOS XPC / Windows SCM / Linux pkexec). */
export async function uninstallEngineService(): Promise<void> {
  await invoke("engine_uninstall_service")
  lastProbe = { state: "missing", at: Date.now() }
}
