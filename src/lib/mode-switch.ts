import { invoke } from "@tauri-apps/api/core"

import { getConfigJsonPath } from "@/lib/app-paths"
import { mergeConnectionConfig } from "@/lib/connection-config"
import { perf } from "@/lib/perf"
import type { RoutingMode } from "@/lib/routing-mode"
import type { ProxyMode } from "@/utils/vpn-service"
import { invalidateControllerClientCache } from "@/utils/singbox-api/controller-cache"

/**
 * Atomic mode switch: pre-generate target config, then invoke the fast-restart
 * backend command. The sing-box process is restarted with the new config in
 * an optimized path (skip full port cleanup, skip config validation).
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
    // 1. Pre-generate the target mode config
    await perf.run("mode-switch.merge", () =>
      mergeConnectionConfig(subscriptionIdentifier, routingMode, targetEnableTun, {
        force: true,
      })
    )
    const configPath = await getConfigJsonPath()
    await invoke("mark_config_verified", { configPath })

    // 2. Invoke the fast-switch backend command
    const mode: ProxyMode = targetEnableTun ? "IntoProxy" : "SystemProxy"
    await perf.run("mode-switch.invoke", () =>
      invoke("switch_proxy_mode", { path: configPath, mode })
    )

    // 3. Invalidate controller client cache (controller port may change)
    invalidateControllerClientCache()
  })
}
