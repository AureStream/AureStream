export type NodeRegion = "asia" | "america" | "europe"

export type RawNodeOutbound = {
  type?: string
  tag?: string
  server?: string
  server_port?: number | string
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

const EXCLUDED_OUTBOUND_TYPES = new Set(["selector", "urltest", "direct", "block", "dns"])

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
    if (EXCLUDED_OUTBOUND_TYPES.has(outbound.type ?? "")) continue

    const tag = outbound.tag ?? ""
    if (!tag || seenTags.has(tag)) continue
    seenTags.add(tag)

    const visuals = inferNodeVisuals(tag)
    nodes.push({
      key: tag,
      id: tag,
      name: tag,
      ping: getLatency(tag) ?? 0,
      flag: visuals.flag,
      protocol: outbound.type ? outbound.type.toUpperCase() : "SHADOWSOCKS",
      region: visuals.region,
      server: outbound.server || "",
      port: Number(outbound.server_port) || 0,
    })
  }

  return nodes
}
