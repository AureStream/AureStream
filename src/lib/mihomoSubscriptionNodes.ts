import type { Node } from "@/types";
import type { Proxies, Proxy, ProxyType } from "tauri-plugin-mihomo-api";

/** 不作为「可选出口」展示的代理类型（策略组 / 内置） */
const NON_LEAF_TYPES: ReadonlySet<ProxyType> = new Set([
  "Direct",
  "Reject",
  "RejectDrop",
  "Compatible",
  "Pass",
  "Dns",
  "Selector",
  "Fallback",
  "URLTest",
  "LoadBalance",
  "Relay",
]);

function isLeafProxy(p: Proxy): boolean {
  if (p.hidden) return false;
  return !NON_LEAF_TYPES.has(p.type);
}

function historyDelay(p: Proxy): number | undefined {
  const h = p.history;
  if (!h?.length) return undefined;
  return h[h.length - 1]?.delay;
}

export function proxyToSubscriptionNode(
  proxy: Proxy,
  providerId: string,
): Node {
  return {
    id: proxy.name,
    name: proxy.name,
    providerId,
    type: proxy.type,
    server: "",
    port: 0,
    delay: historyDelay(proxy),
    enabled: true,
  };
}

/** 从 Mihomo `/proxies` 响应得到当前订阅下的扁平叶子节点列表（用于 UI） */
export function mihomoProxiesToNodes(
  data: Proxies,
  providerId: string,
): Node[] {
  const map = data.proxies ?? {};
  return Object.values(map)
    .filter((p): p is Proxy => p != null && isLeafProxy(p))
    .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"))
    .map((p) => proxyToSubscriptionNode(p, providerId));
}
