// Parse proxy subscription URIs (base64-encoded or plain) into sing-box outbound format.
// Supports: ss://, vmess://, trojan://, vless://, hysteria2://

interface SingBoxOutbound {
  type: string
  tag: string
  server: string
  server_port: number
  [key: string]: unknown
}

/** Base64 decode with charset tolerance (standard + URL-safe). */
function decodeBase64(str: string): string {
  const cleaned = str.replace(/\s/g, "")
  try {
    return atob(cleaned)
  } catch {
    // try URL-safe
    try {
      return atob(cleaned.replace(/-/g, "+").replace(/_/g, "/"))
    } catch {
      throw new Error("Base64 decode failed")
    }
  }
}

/** Decode a base64-encoded string that may be standard or URL-safe. */
function safeBase64Decode(str: string): string {
  try {
    return decodeBase64(str)
  } catch {
    return str
  }
}

function parseSIP002(uri: string): SingBoxOutbound | null {
  // ss://base64(method:password)@host:port#name
  // ss://base64(method:password@host:port)#name (legacy)
  const rest = uri.slice(5)
  const hashIdx = rest.lastIndexOf("#")
  const name = hashIdx >= 0 ? decodeURIComponent(rest.slice(hashIdx + 1)) : "SS Node"
  const base = hashIdx >= 0 ? rest.slice(0, hashIdx) : rest

  const atIdx = base.lastIndexOf("@")
  let method = ""
  let password = ""
  let host = ""
  let port = 8388

  if (atIdx >= 0) {
    const userinfo = safeBase64Decode(base.slice(0, atIdx))
    const colonIdx = userinfo.indexOf(":")
    if (colonIdx >= 0) {
      method = userinfo.slice(0, colonIdx)
      password = userinfo.slice(colonIdx + 1)
    }
    const hostPort = base.slice(atIdx + 1)
    const bracketStart = hostPort.lastIndexOf("]")
    const colonPort = hostPort.lastIndexOf(":")
    if (bracketStart >= 0 && colonPort < bracketStart) {
      host = hostPort
    } else if (colonPort >= 0) {
      host = hostPort.slice(0, colonPort)
      port = parseInt(hostPort.slice(colonPort + 1), 10) || 8388
    } else {
      host = hostPort
    }
  } else {
    // Legacy: base64(method:password@host:port)
    const decoded = safeBase64Decode(base)
    const at = decoded.lastIndexOf("@")
    if (at >= 0) {
      const userInfo = decoded.slice(0, at)
      const mi = userInfo.indexOf(":")
      if (mi >= 0) {
        method = userInfo.slice(0, mi)
        password = userInfo.slice(mi + 1)
      }
      const hp = decoded.slice(at + 1)
      const ci = hp.lastIndexOf(":")
      if (ci >= 0) {
        host = hp.slice(0, ci)
        port = parseInt(hp.slice(ci + 1), 10) || 8388
      } else {
        host = hp
      }
    }
  }

  if (!host || !method) return null

  return {
    type: "shadowsocks",
    tag: name,
    server: host,
    server_port: port,
    method,
    password,
  }
}

function parseVMess(uri: string): SingBoxOutbound | null {
  // vmess://base64(json)
  const rest = uri.slice(8)
  const json = safeBase64Decode(rest)
  let cfg: Record<string, unknown>
  try {
    cfg = JSON.parse(json)
  } catch {
    return null
  }

  const tag = (cfg.ps as string) || "VMess Node"
  const server = cfg.add as string
  const port = parseInt((cfg.port as string) || "0", 10) || 443
  const uuid = cfg.id as string
  if (!server || !uuid) return null

  const security = (cfg.scy as string) || "auto"
  const alterId = parseInt((cfg.aid as string) || "0", 10)

  const transport: Record<string, unknown> = {}
  const net = (cfg.net as string) || "tcp"
  if (net === "ws") {
    transport.type = "ws"
    transport.path = (cfg.path as string) || "/"
    const wsHost = cfg.host as string
    if (wsHost) {
      transport.headers = { Host: wsHost }
    }
  } else if (net === "grpc") {
    transport.type = "grpc"
    transport.service_name = (cfg.path as string) || ""
  } else if (net === "h2") {
    transport.type = "http"
    transport.host = [cfg.host as string || ""]
    transport.path = (cfg.path as string) || "/"
  } else if (net === "quic") {
    transport.type = "quic"
  }

  const tlsEnabled = cfg.tls === "tls"
  const sni = (cfg.sni as string) || (cfg.host as string) || server
  const alpn = (cfg.alpn as string) || undefined

  const result: SingBoxOutbound = {
    type: "vmess",
    tag,
    server,
    server_port: port,
    uuid,
    security,
    alter_id: alterId,
  }

  if (Object.keys(transport).length > 0 || net !== "tcp") {
    result.transport = transport
  }

  if (tlsEnabled) {
    result.tls = {
      enabled: true,
      server_name: sni,
      ...(alpn ? { alpn: [alpn] } : {}),
    }
  }

  return result
}

function parseTrojan(uri: string): SingBoxOutbound | null {
  // trojan://password@host:port?query#name
  const rest = uri.slice(9)
  const hashIdx = rest.lastIndexOf("#")
  const name = hashIdx >= 0 ? decodeURIComponent(rest.slice(hashIdx + 1)) : "Trojan Node"
  const base = hashIdx >= 0 ? rest.slice(0, hashIdx) : rest

  const atIdx = base.lastIndexOf("@")
  if (atIdx < 0) return null
  const password = base.slice(0, atIdx)
  const hostQuery = base.slice(atIdx + 1)

  const qIdx = hostQuery.indexOf("?")
  const hostPort = qIdx >= 0 ? hostQuery.slice(0, qIdx) : hostQuery
  const query = qIdx >= 0 ? hostQuery.slice(qIdx + 1) : ""

  const ci = hostPort.lastIndexOf(":")
  const host = ci >= 0 ? hostPort.slice(0, ci).replace(/[\[\]]/g, "") : hostPort.replace(/[\[\]]/g, "")
  const port = ci >= 0 ? parseInt(hostPort.slice(ci + 1), 10) || 443 : 443

  const params = new URLSearchParams(query)
  const sni = params.get("sni") || host

  const result: SingBoxOutbound = {
    type: "trojan",
    tag: name,
    server: host,
    server_port: port,
    password,
    tls: {
      enabled: true,
      server_name: sni,
    },
  }

  const net = params.get("type") || params.get("network")
  if (net === "ws") {
    result.transport = {
      type: "ws",
      path: params.get("path") || "/",
      ...(params.get("host") ? { headers: { Host: params.get("host")! } } : {}),
    }
  } else if (net === "grpc") {
    result.transport = {
      type: "grpc",
      service_name: params.get("serviceName") || params.get("path") || "",
    }
  }

  const fp = params.get("fp")
  if (fp && result.tls) {
    ;(result.tls as Record<string, unknown>).utls = { enabled: true, fingerprint: fp }
  }

  return result
}

function parseVLess(uri: string): SingBoxOutbound | null {
  // vless://uuid@host:port?query#name
  const rest = uri.slice(8)
  const hashIdx = rest.lastIndexOf("#")
  const name = hashIdx >= 0 ? decodeURIComponent(rest.slice(hashIdx + 1)) : "VLESS Node"
  const base = hashIdx >= 0 ? rest.slice(0, hashIdx) : rest

  const atIdx = base.lastIndexOf("@")
  if (atIdx < 0) return null
  const uuid = base.slice(0, atIdx)
  const hostQuery = base.slice(atIdx + 1)

  const qIdx = hostQuery.indexOf("?")
  const hostPort = qIdx >= 0 ? hostQuery.slice(0, qIdx) : hostQuery
  const query = qIdx >= 0 ? hostQuery.slice(qIdx + 1) : ""

  const ci = hostPort.lastIndexOf(":")
  const host = ci >= 0 ? hostPort.slice(0, ci).replace(/[\[\]]/g, "") : hostPort.replace(/[\[\]]/g, "")
  const port = ci >= 0 ? parseInt(hostPort.slice(ci + 1), 10) || 443 : 443

  const params = new URLSearchParams(query)
  const encryption = params.get("encryption") || "none"
  const flow = params.get("flow") || undefined
  const security = params.get("security") || "none"
  const sni = params.get("sni") || host
  const fp = params.get("fp") || undefined
  const pbk = params.get("pbk") || undefined
  const sid = params.get("sid") || undefined

  const result: SingBoxOutbound = {
    type: "vless",
    tag: name,
    server: host,
    server_port: port,
    uuid,
    flow: flow || "",
    ...(encryption !== "none" ? { encryption } : {}),
  }

  if (security === "tls" || security === "reality") {
    result.tls = {
      enabled: true,
      server_name: sni,
      ...(security === "reality" ? { reality: { enabled: true, public_key: pbk || "", short_id: sid || "" } } : {}),
    }
    if (flow) { (result.tls as Record<string, unknown>).flow = flow }
    if (fp && result.tls) {
      ;(result.tls as Record<string, unknown>).utls = { enabled: true, fingerprint: fp }
    }
  }

  const net = params.get("type")
  if (net === "ws") {
    result.transport = {
      type: "ws",
      path: params.get("path") || "/",
      ...(params.get("host") ? { headers: { Host: params.get("host")! } } : {}),
    }
  } else if (net === "grpc") {
    result.transport = {
      type: "grpc",
      service_name: params.get("serviceName") || "",
    }
  }

  return result
}

function parseHysteria2(uri: string): SingBoxOutbound | null {
  // hysteria2://password@host:port?query#name
  // or: hysteria2://host:port?auth=password&query#name
  const rest = uri.slice(12)
  const hashIdx = rest.lastIndexOf("#")
  const name = hashIdx >= 0 ? decodeURIComponent(rest.slice(hashIdx + 1)) : "Hysteria2 Node"
  const base = hashIdx >= 0 ? rest.slice(0, hashIdx) : rest

  const atIdx = base.lastIndexOf("@")
  let password = ""
  let hostQuery: string
  if (atIdx >= 0) {
    password = base.slice(0, atIdx)
    hostQuery = base.slice(atIdx + 1)
  } else {
    hostQuery = base
  }

  const qIdx = hostQuery.indexOf("?")
  const hostPort = qIdx >= 0 ? hostQuery.slice(0, qIdx) : hostQuery
  const query = qIdx >= 0 ? hostQuery.slice(qIdx + 1) : ""

  const ci = hostPort.lastIndexOf(":")
  const host = ci >= 0 ? hostPort.slice(0, ci).replace(/[\[\]]/g, "") : hostPort.replace(/[\[\]]/g, "")
  const port = ci >= 0 ? parseInt(hostPort.slice(ci + 1), 10) || 443 : 443

  const params = new URLSearchParams(query)
  const auth = params.get("auth") || ""
  const finalPassword = password || auth

  if (!finalPassword || !host) return null

  const sni = params.get("sni") || host
  const insecure = params.get("insecure") === "1"

  const result: SingBoxOutbound = {
    type: "hysteria2",
    tag: name,
    server: host,
    server_port: port,
    password: finalPassword,
    tls: {
      enabled: true,
      server_name: sni,
      ...(insecure ? { insecure: true } : {}),
    },
  }

  const obfs = params.get("obfs")
  if (obfs === "salamander") {
    const obfsPassword = params.get("obfs-password") || ""
    result.obfs = { type: "salamander", password: obfsPassword }
  }

  const upMbps = params.get("upmbps")
  const downMbps = params.get("downmbps")
  if (upMbps) result.up_mbps = parseInt(upMbps, 10)
  if (downMbps) result.down_mbps = parseInt(downMbps, 10)

  return result
}

type Parser = (uri: string) => SingBoxOutbound | null

const parsers: [string, Parser][] = [
  ["ss://", parseSIP002],
  ["vmess://", parseVMess],
  ["trojan://", parseTrojan],
  ["vless://", parseVLess],
  ["hysteria2://", parseHysteria2],
  ["hy2://", parseHysteria2],
]

/** Parse one proxy URI into a sing-box outbound, or null if unrecognised. */
function parseLine(line: string): SingBoxOutbound | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  for (const [prefix, parser] of parsers) {
    if (trimmed.startsWith(prefix)) {
      return parser(trimmed)
    }
  }
  return null
}

/** Parse a plain-text proxy list (one URI per line) into sing-box outbounds. */
function parseProxyList(text: string): SingBoxOutbound[] {
  return text
    .split("\n")
    .map(parseLine)
    .filter((v): v is SingBoxOutbound => v !== null)
}

/** Attempt to parse a response body as a sing-box-compatible subscription config.
 *  Tries JSON first, then base64-encoded proxy list. */
export function parseSubscriptionBody(body: string): { outbounds: SingBoxOutbound[] } {
  // 1. Try JSON
  try {
    const parsed = JSON.parse(body)
    if (parsed?.outbounds && Array.isArray(parsed.outbounds)) {
      return parsed
    }
  } catch {
    // not JSON, continue
  }

  // 2. Try base64 decode → proxy list
  const decoded = decodeBase64(body)
  const outbounds = parseProxyList(decoded)
  if (outbounds.length > 0) {
    return { outbounds }
  }

  // 3. Try parsing the raw body as plain proxy list
  const rawOutbounds = parseProxyList(body)
  if (rawOutbounds.length > 0) {
    return { outbounds }
  }

  throw new Error("Cannot parse subscription: not JSON, not a recognized proxy list format")
}
