import { invoke } from "@tauri-apps/api/core"

const PROBE_TTL_MS = 30_000

let lastProbe: { installed: boolean; at: number } | null = null

export function invalidateEngineProbeCache(): void {
  lastProbe = null
}

/** Cached cross-platform TUN/helper service probe (macOS helper, Windows SCM, Linux pkexec). */
export async function probeEngineService(force = false): Promise<boolean> {
  const now = Date.now()
  if (!force && lastProbe && now - lastProbe.at < PROBE_TTL_MS) {
    return lastProbe.installed
  }

  try {
    await invoke("engine_probe")
    lastProbe = { installed: true, at: now }
    return true
  } catch {
    lastProbe = { installed: false, at: now }
    return false
  }
}

export async function ensureEngineServiceInstalled(): Promise<void> {
  await invoke("engine_ensure_installed")
  lastProbe = { installed: true, at: Date.now() }
}
