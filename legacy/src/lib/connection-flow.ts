import { getConfigJsonPath } from "@/lib/app-paths"
import { ensureConnectionConfigReady } from "@/lib/config-sync"
import { perf } from "@/lib/perf"
import type { RoutingMode } from "@/lib/routing-mode"
import { startEngine, type ProxyMode } from "@/utils/vpn-service"

/** Start engine using pre-merged config.json (merge runs on input changes, not here). */
export async function connectEngine(
  subscriptionIdentifier: string,
  routingMode: RoutingMode,
  enableTun: boolean
): Promise<void> {
  await perf.run("connect.total", async () => {
    await perf.run("connect.ensure-config", () =>
      ensureConnectionConfigReady(subscriptionIdentifier, routingMode, enableTun)
    )

    const configPath = await perf.run("connect.resolve-path", getConfigJsonPath)

    const mode: ProxyMode = enableTun ? "IntoProxy" : "SystemProxy"

    await perf.run("connect.start", () => startEngine(configPath, mode))
  })
}
