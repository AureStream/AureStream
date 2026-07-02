import {
  setGlobalConfig,
  setRuleConfig,
} from "@/config/merger/main"
import {
  invalidateConnectionConfigCache,
} from "@/lib/merge-cache"
import type { RoutingMode } from "@/lib/routing-mode"
import { isGlobalRouting } from "@/lib/routing-mode"

export type MergeConnectionOptions = {
  /** Skip cache and always rewrite config.json */
  force?: boolean
}

export { invalidateConnectionConfigCache }

export async function mergeConnectionConfig(
  subscriptionIdentifier: string,
  routingMode: RoutingMode,
  enableTun: boolean,
  _options: MergeConnectionOptions = {}
): Promise<boolean> {
  const global = isGlobalRouting(routingMode)
  await (global ? setGlobalConfig : setRuleConfig)(subscriptionIdentifier, enableTun)

  return true
}

export async function isConnectionConfigFresh(
  _subscriptionIdentifier: string,
  _routingMode: RoutingMode,
  _enableTun: boolean
): Promise<boolean> {
  // Config is never strictly fresh because we must always fetch the remote template.
  return false
}
