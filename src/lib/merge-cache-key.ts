import { getSubscriptionMergeRevision } from "@/action/db"
import {
  getAllowLan,
  getConfiguredDirectDNS,
  getControllerPort,
  getProxyPort,
  isBypassRouterEnabled,
} from "@/single/store"
import type { RoutingMode } from "@/lib/routing-mode"

export type MergeCacheInput = {
  subscriptionIdentifier: string
  routingMode: RoutingMode
  enableTun: boolean
}

/**
 * Fingerprint of every store/DB input that affects config.json content.
 * When this key is unchanged, merge can skip rewriting the file.
 */
export async function computeMergeCacheKey(
  input: MergeCacheInput
): Promise<string> {
  const [
    subRevision,
    allowLan,
    bypassRouter,
    proxyPort,
    directDns,
    controllerPort,
  ] = await Promise.all([
    getSubscriptionMergeRevision(input.subscriptionIdentifier),
    getAllowLan(),
    isBypassRouterEnabled(),
    getProxyPort(),
    getConfiguredDirectDNS(),
    getControllerPort(),
  ])

  return [
    input.subscriptionIdentifier,
    input.routingMode,
    input.enableTun ? "tun" : "system",
    subRevision,
    allowLan ? "1" : "0",
    bypassRouter ? "1" : "0",
    String(proxyPort),
    directDns ?? "",
    String(controllerPort),
  ].join("|")
}
