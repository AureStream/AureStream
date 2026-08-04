import { getSubscriptionMergeRevision } from "@/action/db"
import {
  getAllowLan,
  getConfiguredDirectDNS,
  getControllerPort,
  getEnableIpv6,
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
    enableIpv6,
  ] = await Promise.all([
    getSubscriptionMergeRevision(input.subscriptionIdentifier),
    getAllowLan(),
    isBypassRouterEnabled(),
    getProxyPort(),
    getConfiguredDirectDNS(),
    getControllerPort(),
    getEnableIpv6(),
  ])

  return [
    input.subscriptionIdentifier,
    input.routingMode,
    input.enableTun ? "tun" : "system",
    enableIpv6 ? "ipv6" : "ipv4",
    subRevision,
    allowLan ? "1" : "0",
    bypassRouter ? "1" : "0",
    String(proxyPort),
    directDns ?? "",
    String(controllerPort),
  ].join("|")
}
