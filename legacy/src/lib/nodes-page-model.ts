export type NodeRegion = "asia" | "america" | "europe"

export type RawNodeOutbound = {
  /** sing-box style */
  type?: string
  /** Xray style */
  protocol?: string
  tag?: string
  server?: string
  server_port?: number | string
  settings?: {
    vnext?: Array<{ address?: string; port?: number | string }>
    servers?: Array<{ address?: string; port?: number | string }>
  }
}

export type NodeData = {
  key: string
  id: string
  name: string
  flag: string
  ping: number
  protocol: string
  region: NodeRegion
  server: string
  port: number
}

const EXCLUDED_OUTBOUND_KINDS = new Set([
  "selector",
  "urltest",
  "direct",
  "block",
  "dns",
  "freedom",
  "blackhole",
  "loopback",
  "dokodemo-door",
])

const PROXY_KINDS = new Set([
  "vmess",
  "vless",
  "trojan",
  "shadowsocks",
  "shadowsocks_2022",
  "wireguard",
  "hysteria",
  "hysteria2",
])

function outboundKind(outbound: RawNodeOutbound): string {
  return (outbound.protocol || outbound.type || "").toLowerCase()
}

function extractServerPort(outbound: RawNodeOutbound): { server: string; port: number } {
  if (outbound.server) {
    return { server: outbound.server, port: Number(outbound.server_port) || 0 }
  }
  const vnext = outbound.settings?.vnext?.[0]
  if (vnext?.address) {
    return { server: vnext.address, port: Number(vnext.port) || 0 }
  }
  const server = outbound.settings?.servers?.[0]
  if (server?.address) {
    return { server: server.address, port: Number(server.port) || 0 }
  }
  return { server: "", port: 0 }
}

function inferNodeVisuals(tag: string): { flag: string; region: NodeRegion } {
  const lowerTag = tag.toLowerCase()

  if (tag.includes("日本") || lowerTag.includes("jp") || lowerTag.includes("tokyo")) {
    return { flag: "🇯🇵", region: "asia" }
  }
  if (tag.includes("新加坡") || lowerTag.includes("sg") || lowerTag.includes("singapore")) {
    return { flag: "🇸🇬", region: "asia" }
  }
  if (tag.includes("香港") || lowerTag.includes("hk") || lowerTag.includes("hong kong")) {
    return { flag: "🇭🇰", region: "asia" }
  }
  if (
    tag.includes("美国") ||
    lowerTag.includes("us") ||
    lowerTag.includes("america") ||
    lowerTag.includes("los angeles") ||
    lowerTag.includes("new york")
  ) {
    return { flag: "🇺🇸", region: "america" }
  }
  if (tag.includes("英国") || lowerTag.includes("uk") || lowerTag.includes("london") || lowerTag.includes("gb")) {
    return { flag: "🇬🇧", region: "europe" }
  }
  if (lowerTag.includes("de") || tag.includes("德国") || lowerTag.includes("frankfurt")) {
    return { flag: "🇩🇪", region: "europe" }
  }

  return { flag: "🌐", region: "asia" }
}

export function buildNodeList(
  outbounds: RawNodeOutbound[],
  getLatency: (tag: string) => number | undefined,
): NodeData[] {
  const seenTags = new Set<string>()
  const nodes: NodeData[] = []

  for (const outbound of outbounds) {
    const kind = outboundKind(outbound)
    if (EXCLUDED_OUTBOUND_KINDS.has(kind)) continue
    // When protocol/type is present, only keep known proxy kinds (skip mixed junk).
    // When missing, keep tag-bearing entries for backward-compat with partial data.
    if (kind && !PROXY_KINDS.has(kind)) continue

    const tag = outbound.tag ?? ""
    if (!tag || seenTags.has(tag)) continue
    seenTags.add(tag)

    const visuals = inferNodeVisuals(tag)
    const { server, port } = extractServerPort(outbound)
    nodes.push({
      key: tag,
      id: tag,
      name: tag,
      ping: getLatency(tag) ?? 0,
      flag: visuals.flag,
      protocol: kind ? kind.toUpperCase() : "PROXY",
      region: visuals.region,
      server,
      port,
    })
  }

  return nodes
}
