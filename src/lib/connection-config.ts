import setGlobalTunConfig, {
  setGlobalMixedConfig,
  setMixedConfig,
  setTunConfig,
} from "@/config/merger/main"
import type { RoutingMode } from "@/lib/routing-mode"
import { isGlobalRouting } from "@/lib/routing-mode"

/** Merge sing-box config.json for the active subscription and routing/TUN choice. */
export async function mergeConnectionConfig(
  subscriptionIdentifier: string,
  routingMode: RoutingMode,
  enableTun: boolean
): Promise<void> {
  const global = isGlobalRouting(routingMode)
  if (enableTun) {
    await (global ? setGlobalTunConfig : setTunConfig)(subscriptionIdentifier)
  } else {
    await (global ? setGlobalMixedConfig : setMixedConfig)(subscriptionIdentifier)
  }
}
