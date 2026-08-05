import {
  setGlobalConfig,
  setRuleConfig,
} from "@/config/merger/main"
import {
  getLastMergeCacheKey,
  invalidateConnectionConfigCache,
  setLastMergeCacheKey,
} from "@/lib/merge-cache"
import { computeMergeCacheKey } from "@/lib/merge-cache-key"
import type { RoutingMode } from "@/lib/routing-mode"
import { isGlobalRouting } from "@/lib/routing-mode"

export type MergeConnectionOptions = {
  /** Skip cache and always rewrite config.json */
  force?: boolean
}

export { invalidateConnectionConfigCache }

/**
 * Merge subscription + settings into config.json.
 * @returns true when the file was rewritten; false when cache hit skipped work.
 */
export async function mergeConnectionConfig(
  subscriptionIdentifier: string,
  routingMode: RoutingMode,
  enableTun: boolean,
  options: MergeConnectionOptions = {}
): Promise<boolean> {
  const cacheKey = await computeMergeCacheKey({
    subscriptionIdentifier,
    routingMode,
    enableTun,
  })

  if (!options.force && getLastMergeCacheKey() === cacheKey) {
    return false
  }

  const global = isGlobalRouting(routingMode)
  await (global ? setGlobalConfig : setRuleConfig)(subscriptionIdentifier, enableTun)

  setLastMergeCacheKey(cacheKey)
  return true
}
