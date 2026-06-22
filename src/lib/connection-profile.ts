import type { MergeProfile } from "@/config/merger/main"
import type { RoutingMode } from "@/lib/routing-mode"
import { isGlobalRouting } from "@/lib/routing-mode"

export function resolveResidentMergeProfile(
  routingMode: RoutingMode
): MergeProfile {
  const global = isGlobalRouting(routingMode)
  return global
    ? {
        mode: "resident-global",
        cacheFileName: "resident-cache-global-v1.db",
        tun: true,
        customRules: false,
      }
    : {
        mode: "resident",
        cacheFileName: "resident-cache-rule-v1.db",
        tun: true,
        customRules: true,
      }
}
