import { getSubscriptionMergeRevision } from "@/action/db"
import {
  getAllowLan,
  getConfiguredDirectDNS,
  getControllerPort,
  getControllerSecret,
  getProxyPort,
  getStoreValue,
  getTunStack,
  getUseDHCP,
  isBypassRouterEnabled,
} from "@/single/store"
import { STAGE_VERSION_STORE_KEY } from "@/types/definition"
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
    tunStack,
    useDHCP,
    directDns,
    controllerPort,
    controllerSecret,
    stageVersion,
  ] = await Promise.all([
    getSubscriptionMergeRevision(input.subscriptionIdentifier),
    getAllowLan(),
    isBypassRouterEnabled(),
    getProxyPort(),
    getTunStack(),
    getUseDHCP(),
    getConfiguredDirectDNS(),
    getControllerPort(),
    getControllerSecret(),
    getStoreValue(STAGE_VERSION_STORE_KEY, "release"),
  ])

  return [
    input.subscriptionIdentifier,
    input.routingMode,
    input.enableTun ? "tun" : "system",
    subRevision,
    allowLan ? "1" : "0",
    bypassRouter ? "1" : "0",
    String(proxyPort),
    tunStack,
    useDHCP ? "1" : "0",
    directDns ?? "",
    String(controllerPort),
    controllerSecret,
    String(stageVersion ?? ""),
  ].join("|")
}
