import {
  computeMergeCacheKey,
  setGlobalConfig,
  setRuleConfig,
  makeProfile,
  type MergeProfile,
} from "@/config/merger/main"
import {
  getLastMergeCacheKey,
  invalidateConnectionConfigCache,
  setLastMergeCacheKey,
} from "@/lib/merge-cache"
import type { RoutingMode } from "@/lib/routing-mode"
import { isGlobalRouting } from "@/lib/routing-mode"

export type MergeConnectionOptions = {
  /** Skip cache and always rewrite config.json */
  force?: boolean
}

export { invalidateConnectionConfigCache }

function resolveMergeProfile(
  routingMode: RoutingMode,
  enableTun: boolean
): MergeProfile {
  return makeProfile(routingMode, enableTun)
}

/** Merge sing-box config.json for the active subscription and routing/TUN choice. */
export async function mergeConnectionConfig(
  subscriptionIdentifier: string,
  routingMode: RoutingMode,
  enableTun: boolean,
  options: MergeConnectionOptions = {}
): Promise<boolean> {
  const profile = resolveMergeProfile(routingMode, enableTun)
  const cacheKey = await computeMergeCacheKey(subscriptionIdentifier, profile)

  if (!options.force && cacheKey === getLastMergeCacheKey()) {
    console.info("[connection-config] merge skipped (inputs unchanged)")
    return false
  }

  const global = isGlobalRouting(routingMode)
  await (global ? setGlobalConfig : setRuleConfig)(subscriptionIdentifier, enableTun)

  setLastMergeCacheKey(cacheKey)
  return true
}

/** True when config.json already reflects the given subscription / routing / TUN inputs. */
export async function isConnectionConfigFresh(
  subscriptionIdentifier: string,
  routingMode: RoutingMode,
  enableTun: boolean
): Promise<boolean> {
  const profile = resolveMergeProfile(routingMode, enableTun)
  const cacheKey = await computeMergeCacheKey(subscriptionIdentifier, profile)
  return cacheKey === getLastMergeCacheKey()
}
