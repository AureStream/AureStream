import { invoke } from "@tauri-apps/api/core"

import { getConfigJsonPath } from "@/lib/app-paths"
import { mergeConnectionConfig } from "@/lib/connection-config"
import { perf } from "@/lib/perf"
import type { RoutingMode } from "@/lib/routing-mode"
import type { ProxyMode } from "@/utils/vpn-service"
import { invalidateControllerClientCache } from "@/utils/singbox-api/controller-cache"

/**
 * Mode switch: stop the current engine, generate new config, then restart.
 * Uses the standard stop() + start() backend commands (same path as manual
 * stop/start, just automated in sequence with no extra delays).
 *
 * Requires the engine to be currently running. For disconnected state,
 * just generate the config and let the next connect use it.
 */
export async function switchProxyMode(
  subscriptionIdentifier: string,
  routingMode: RoutingMode,
  targetEnableTun: boolean
): Promise<void> {
  await perf.run("mode-switch.total", async () => {
    // 1. Stop the current engine
    await perf.run("mode-switch.stop", () => invoke("stop"))

    // 2. Pre-generate the target mode config
    await perf.run("mode-switch.merge", () =>
      mergeConnectionConfig(subscriptionIdentifier, routingMode, targetEnableTun, {
        force: true,
      })
    )
    const configPath = await getConfigJsonPath()

    // 3. Start the engine with the new mode
    const mode: ProxyMode = targetEnableTun ? "IntoProxy" : "SystemProxy"
    await perf.run("mode-switch.start", () =>
      invoke("start", { path: configPath, mode })
    )

    // 4. Invalidate controller client cache (controller port may change)
    invalidateControllerClientCache()
  })
}
