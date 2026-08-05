// Parse proxy subscription URIs (base64-encoded or plain) into Xray-core outbound format.
// Supports: ss://, vmess://, trojan://, vless://, hysteria2://, plus Clash-Meta YAML proxies.
//
// Schema verified against XTLS/Xray-core source (infra/conf/{vless,vmess,trojan,shadowsocks,
// freedom,transport_internet,transport_method,transport_security}.go) — see commit history for
// the exact revision this was checked against.

export interface XrayOutbound {
  tag: string
  protocol: string
  settings?: Record<string, unknown>
  streamSettings?: Record<string, unknown>
  /**
   * Merger-only directive (stripped before being written to config.json).
   * Xray has no per-outbound "fragment" stream setting — TLS-ClientHello
   * fragmentation is done via a dedicated `freedom` outbound with
   * `settings.fragment`, wired in through `streamSettings.sockopt.dialerProxy`.
   * The merger dedupes identical fragment tuples into shared outbounds.
   */
  _fragment?: FragmentSpec
  [key: string]: unknown
}

export interface FragmentSpec {
  packets: string
  length: string
  interval: string
}

/** Xray outbound protocols that represent an actual remote proxy server. */
const PROXY_PROTOCOLS = new Set([
  "vmess",
  "vless",
  "trojan",
  "shadowsocks",
  "shadowsocks_2022",
  "wireguard",
  "hysteria",
  "hysteria2",
])

/** True when an outbound is a usable proxy node (not direct/block/dns/etc). */
export function isProxyOutbound(item: unknown): item is XrayOutbound {
  if (!item || typeof item !== "object") return false
  const o = item as XrayOutbound
  if (!o.tag || !o.protocol) return false
  return PROXY_PROTOCOLS.has(o.protocol)
}

/** Extract usable proxy outbounds from a subscription config object, deduped by tag. */
export function filterProxyOutbounds(outbounds: unknown[]): XrayOutbound[] {
  const seen = new Set<string>()
  const result: XrayOutbound[] = []
  for (const item of outbounds) {
    if (!isProxyOutbound(item)) continue
    if (seen.has(item.tag)) continue
    seen.add(item.tag)
    result.push(item)
  }
  return result
}

/** Whether config data contains at least one usable proxy outbound. */
export function hasUsableProxyOutbounds(data: unknown): boolean {
  if (!data || typeof data !== "object") return false
  const outbounds = (data as { outbounds?: unknown }).outbounds
  if (!Array.isArray(outbounds)) return false
  return filterProxyOutbounds(outbounds).length > 0
}

/** Base64 decode with charset tolerance (standard + URL-safe). */
function decodeBase64(str: string): string {
  const cleaned = str.replace(/\s/g, "")
  try {
    return atob(cleaned)
  } catch {
    try {
      return atob(cleaned.replace(/-/g, "+").replace(/_/g, "/"))
    } catch {
      throw new Error("Base64 decode failed")
    }
  }
}

/** Decode a base64-encoded string that may be standard or URL-safe; falls back to input as-is. */
function safeBase64Decode(str: string): string {
  try {
    return decodeBase64(str)
  } catch {
    return str
  }
}

function parseAlpnList(alpn: string | null | undefined): string[] | undefined {
  if (!alpn) return undefined
  const list = alpn
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  return list.length > 0 ? list : undefined
}

/**
 * Best-effort parse of a `fragment=` URI query param into Xray's freedom
 * outbound fragment tuple (`packets`, `length`, `interval` — all plain
 * "N" / "N-M" strings, per `Int32Range.UnmarshalJSON`).
 *
 * Two shapes are seen in the wild:
 *  - `<packets>,<length>,<interval>` (e.g. "tlshello,40-60,30-50")
 *  - `<enable 0|1>,<length>,<interval>,<packets>` (e.g. "1,40-60,30-50,tlshello")
 * The second form's leading flag gates whether fragmentation applies at all.
 */
function parseFragmentParam(raw: string | null): FragmentSpec | undefined {
  if (!raw) return undefined
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean)
  if (parts.length === 3) {
    const [packets, length, interval] = parts
    if (!length) return undefined
    return { packets: packets || "tlshello", length, interval: interval || length }
  }
  if (parts.length === 4 && (parts[0] === "0" || parts[0] === "1")) {
    if (parts[0] === "0") return undefined
    const [, length, interval, packets] = parts
    if (!length) return undefined
    return { packets: packets || "tlshello", length, interval: interval || length }
  }
  return undefined
}

/** Normalize a URI/vmess-json `type`/`network` value to Xray's `streamSettings.network`. */
function normalizeNetwork(raw: string): string {
  const net = raw.toLowerCase()
  if (net === "" || net === "raw") return "tcp"
  if (net === "websocket") return "ws"
  if (net === "splithttp") return "xhttp"
  return net
}

/** Build `streamSettings` (transport + TLS/REALITY) from URI query params. */
function buildStreamSettingsFromParams(
  params: URLSearchParams,
  host: string
): Record<string, unknown> | undefined {
  const stream: Record<string, unknown> = {}
  let hasContent = false

  const net = normalizeNetwork(params.get("type") || params.get("network") || "tcp")
  if (net !== "tcp") {
    stream.network = net
    hasContent = true
    if (net === "ws") {
      const ws: Record<string, unknown> = { path: params.get("path") || "/" }
      const wsHost = params.get("host")
      if (wsHost) ws.host = wsHost
      stream.wsSettings = ws
    } else if (net === "grpc") {
      stream.grpcSettings = {
        serviceName: params.get("serviceName") || params.get("path") || "",
      }
    } else if (net === "httpupgrade") {
      const hu: Record<string, unknown> = { path: params.get("path") || "/" }
      const huHost = params.get("host")
      if (huHost) hu.host = huHost
      stream.httpupgradeSettings = hu
    } else if (net === "xhttp") {
      const xh: Record<string, unknown> = { path: params.get("path") || "/" }
      const xhHost = params.get("host")
      if (xhHost) xh.host = xhHost
      const mode = params.get("mode")
      if (mode) xh.mode = mode
      stream.xhttpSettings = xh
    }
  }

  const security = params.get("security") || "none"
  if (security === "tls" || security === "reality") {
    hasContent = true
    stream.security = security
    const sni = params.get("sni") || host
    const fp = params.get("fp") || undefined
    if (security === "tls") {
      const tls: Record<string, unknown> = { serverName: sni }
      if (fp) tls.fingerprint = fp
      const alpn = parseAlpnList(params.get("alpn"))
      if (alpn) tls.alpn = alpn
      const insecure =
        params.get("allowInsecure") === "1" || params.get("insecure") === "1"
      if (insecure) tls.allowInsecure = true
      stream.tlsSettings = tls
    } else {
      const reality: Record<string, unknown> = {
        serverName: sni,
        publicKey: params.get("pbk") || "",
        shortId: params.get("sid") || "",
      }
      if (fp) reality.fingerprint = fp
      const spx = params.get("spx")
      if (spx) reality.spiderX = spx
      stream.realitySettings = reality
    }
  }

  return hasContent ? stream : undefined
}

function parseSIP002(uri: string): XrayOutbound | null {
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
    tag: name,
    protocol: "shadowsocks",
    settings: {
      servers: [{ address: host, port, method, password }],
    },
  }
}

function parseVMess(uri: string): XrayOutbound | null {
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
  const net = normalizeNetwork((cfg.net as string) || "tcp")

  const stream: Record<string, unknown> = {}
  let hasStream = false
  if (net !== "tcp") {
    stream.network = net
    hasStream = true
    if (net === "ws") {
      const ws: Record<string, unknown> = { path: (cfg.path as string) || "/" }
      if (cfg.host) ws.host = cfg.host
      stream.wsSettings = ws
    } else if (net === "grpc") {
      stream.grpcSettings = { serviceName: (cfg.path as string) || "" }
    } else if (net === "httpupgrade") {
      const hu: Record<string, unknown> = { path: (cfg.path as string) || "/" }
      if (cfg.host) hu.host = cfg.host
      stream.httpupgradeSettings = hu
    } else if (net === "xhttp") {
      const xh: Record<string, unknown> = { path: (cfg.path as string) || "/" }
      if (cfg.host) xh.host = cfg.host
      if (cfg.mode) xh.mode = cfg.mode
      stream.xhttpSettings = xh
    }
  }

  const tlsEnabled = cfg.tls === "tls"
  if (tlsEnabled) {
    hasStream = true
    stream.security = "tls"
    const sni = (cfg.sni as string) || (cfg.host as string) || server
    const tls: Record<string, unknown> = { serverName: sni }
    const alpn = parseAlpnList(cfg.alpn as string)
    if (alpn) tls.alpn = alpn
    stream.tlsSettings = tls
  }

  return {
    tag,
    protocol: "vmess",
    settings: {
      vnext: [
        {
          address: server,
          port,
          users: [{ id: uuid, security, alterId: 0 }],
        },
      ],
    },
    ...(hasStream ? { streamSettings: stream } : {}),
  }
}

function parseTrojan(uri: string): XrayOutbound | null {
  // trojan://password@host:port?query#name
  const rest = uri.slice(9)
  const hashIdx = rest.lastIndexOf("#")
  const name = hashIdx >= 0 ? decodeURIComponent(rest.slice(hashIdx + 1)) : "Trojan Node"
  const base = hashIdx >= 0 ? rest.slice(0, hashIdx) : rest

  const atIdx = base.lastIndexOf("@")
  if (atIdx < 0) return null
  const password = decodeURIComponent(base.slice(0, atIdx))
  const hostQuery = base.slice(atIdx + 1)

  const qIdx = hostQuery.indexOf("?")
  const hostPort = qIdx >= 0 ? hostQuery.slice(0, qIdx) : hostQuery
  const query = qIdx >= 0 ? hostQuery.slice(qIdx + 1) : ""

  const ci = hostPort.lastIndexOf(":")
  const host = ci >= 0 ? hostPort.slice(0, ci).replace(/[[\]]/g, "") : hostPort.replace(/[[\]]/g, "")
  const port = ci >= 0 ? parseInt(hostPort.slice(ci + 1), 10) || 443 : 443

  const params = new URLSearchParams(query)
  // Trojan is TLS-by-default; only an explicit security=none turns it off.
  if (!params.has("security")) params.set("security", "tls")
  const stream = buildStreamSettingsFromParams(params, host)
  const fragment = parseFragmentParam(params.get("fragment"))

  return {
    tag: name,
    protocol: "trojan",
    settings: {
      servers: [{ address: host, port, password }],
    },
    ...(stream ? { streamSettings: stream } : {}),
    ...(fragment ? { _fragment: fragment } : {}),
  }
}

function parseVLess(uri: string): XrayOutbound | null {
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
  const host = ci >= 0 ? hostPort.slice(0, ci).replace(/[[\]]/g, "") : hostPort.replace(/[[\]]/g, "")
  const port = ci >= 0 ? parseInt(hostPort.slice(ci + 1), 10) || 443 : 443

  const params = new URLSearchParams(query)
  const encryption = params.get("encryption") || "none"
  const flow = params.get("flow") || undefined

  const user: Record<string, unknown> = { id: uuid, encryption }
  if (flow) user.flow = flow

  const stream = buildStreamSettingsFromParams(params, host)
  const fragment = parseFragmentParam(params.get("fragment"))

  return {
    tag: name,
    protocol: "vless",
    settings: {
      vnext: [{ address: host, port, users: [user] }],
    },
    ...(stream ? { streamSettings: stream } : {}),
    ...(fragment ? { _fragment: fragment } : {}),
  }
}

function parseHysteria2(uri: string): XrayOutbound | null {
  // hysteria2://password@host:port?query#name (or hy2://...)
  const prefix = uri.startsWith("hy2://") ? "hy2://" : "hysteria2://"
  const rest = uri.slice(prefix.length)
  const hashIdx = rest.lastIndexOf("#")
  const name = hashIdx >= 0 ? decodeURIComponent(rest.slice(hashIdx + 1)) : "Hysteria2 Node"
  const base = hashIdx >= 0 ? rest.slice(0, hashIdx) : rest

  const atIdx = base.lastIndexOf("@")
  let password = ""
  let hostQuery: string
  if (atIdx >= 0) {
    password = decodeURIComponent(base.slice(0, atIdx))
    hostQuery = base.slice(atIdx + 1)
  } else {
    hostQuery = base
  }

  const qIdx = hostQuery.indexOf("?")
  const hostPort = qIdx >= 0 ? hostQuery.slice(0, qIdx) : hostQuery
  const query = qIdx >= 0 ? hostQuery.slice(qIdx + 1) : ""

  const ci = hostPort.lastIndexOf(":")
  const host = ci >= 0 ? hostPort.slice(0, ci).replace(/[[\]]/g, "") : hostPort.replace(/[[\]]/g, "")
  const port = ci >= 0 ? parseInt(hostPort.slice(ci + 1), 10) || 443 : 443

  const params = new URLSearchParams(query)
  const auth = params.get("auth") || ""
  const finalPassword = password || auth
  if (!finalPassword || !host) return null

  const sni = params.get("sni") || host
  const insecure = params.get("insecure") === "1" || params.get("allowInsecure") === "1"

  const tls: Record<string, unknown> = { serverName: sni }
  if (insecure) tls.allowInsecure = true

  return {
    tag: name,
    protocol: "hysteria2",
    settings: {
      servers: [{ address: host, port, password: finalPassword }],
    },
    streamSettings: { security: "tls", tlsSettings: tls },
  }
}

type Parser = (uri: string) => XrayOutbound | null

const parsers: [string, Parser][] = [
  ["ss://", parseSIP002],
  ["vmess://", parseVMess],
  ["trojan://", parseTrojan],
  ["vless://", parseVLess],
  ["hysteria2://", parseHysteria2],
  ["hy2://", parseHysteria2],
]

/** Parse one proxy URI into an Xray outbound, or null if unrecognised. */
function parseLine(line: string): XrayOutbound | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  for (const [prefix, parser] of parsers) {
    if (trimmed.startsWith(prefix)) {
      return parser(trimmed)
    }
  }
  return null
}

/** Parse a plain-text proxy list (one URI per line) into Xray outbounds. */
function parseProxyList(text: string): XrayOutbound[] {
  return text
    .split("\n")
    .map(parseLine)
    .filter((v): v is XrayOutbound => v !== null)
}

/**
 * Parse a Clash-Meta-style inline proxy object (already-decoded JS object,
 * e.g. from a flow-style YAML line) into an Xray outbound.
 */
export function parseClashProxyObject(p: Record<string, unknown>): XrayOutbound | null {
  const type = String(p.type || "").toLowerCase()
  const name = String(p.name || p.tag || "Node")
  const server = String(p.server || "")
  const port = parseInt(String(p.port ?? "0"), 10) || 443
  if (!server || !type) return null

  if (type !== "vless") return null // only the CF-tunnel-panel shape is common enough to support here

  const uuid = String(p.uuid || "")
  if (!uuid) return null

  const user: Record<string, unknown> = { id: uuid, encryption: "none" }
  if (p.flow) user.flow = String(p.flow)

  const stream: Record<string, unknown> = {}
  let hasStream = false

  const tlsOn = p.tls === true || p.tls === "true" || p.tls === 1
  if (tlsOn || p.servername || p.sni) {
    hasStream = true
    stream.security = "tls"
    const tls: Record<string, unknown> = {
      serverName: String(p.servername || p.sni || server),
    }
    if (p["skip-cert-verify"] === true || p.skip_cert_verify === true) {
      tls.allowInsecure = true
    }
    const fp = p["client-fingerprint"] || p.client_fingerprint || p.fp
    if (fp) tls.fingerprint = String(fp)
    const alpn = p.alpn
    if (Array.isArray(alpn)) tls.alpn = alpn.map(String)
    else if (typeof alpn === "string") tls.alpn = parseAlpnList(alpn)
    stream.tlsSettings = tls
  }

  const network = normalizeNetwork(String(p.network || p.net || "tcp"))
  if (network !== "tcp") {
    hasStream = true
    stream.network = network
    if (network === "ws") {
      const opts = (p["ws-opts"] || p.ws_opts || {}) as Record<string, unknown>
      const headers = (opts.headers || {}) as Record<string, unknown>
      stream.wsSettings = {
        path: String(opts.path || p.path || "/"),
        ...(headers.Host || headers.host ? { host: String(headers.Host || headers.host) } : {}),
      }
    } else if (network === "grpc") {
      const opts = (p["grpc-opts"] || p.grpc_opts || {}) as Record<string, unknown>
      stream.grpcSettings = {
        serviceName: String(opts["grpc-service-name"] || opts.service_name || ""),
      }
    }
  }

  return {
    tag: name,
    protocol: "vless",
    settings: { vnext: [{ address: server, port, users: [user] }] },
    ...(hasStream ? { streamSettings: stream } : {}),
  }
}

/**
 * Best-effort Clash YAML proxies extraction without a full YAML dependency.
 * Handles flow-style list items: `  - {name: ..., type: vless, ...}`
 */
export function parseClashYamlProxies(text: string): XrayOutbound[] {
  const outbounds: XrayOutbound[] = []
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith("- {") && !trimmed.startsWith("-{")) continue
    const body = trimmed.replace(/^-+\s*/, "")
    const obj = parseYamlFlowMap(body)
    if (!obj) continue
    const outbound = parseClashProxyObject(obj)
    if (outbound) outbounds.push(outbound)
  }
  return outbounds
}

/** Parse a single YAML flow mapping `{a: b, c: d}` into a plain object (best-effort). */
function parseYamlFlowMap(input: string): Record<string, unknown> | null {
  const s = input.trim()
  if (!s.startsWith("{") || !s.endsWith("}")) return null
  try {
    return JSON.parse(s) as Record<string, unknown>
  } catch {
    // continue with tolerant tokenizer below
  }

  const inner = s.slice(1, -1)
  const entries: string[] = []
  let buf = ""
  let depthBrace = 0
  let depthBracket = 0
  let inSingle = false
  let inDouble = false
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]
    if (ch === "'" && !inDouble) inSingle = !inSingle
    else if (ch === '"' && !inSingle) inDouble = !inDouble
    else if (!inSingle && !inDouble) {
      if (ch === "{") depthBrace++
      else if (ch === "}") depthBrace--
      else if (ch === "[") depthBracket++
      else if (ch === "]") depthBracket--
      else if (ch === "," && depthBrace === 0 && depthBracket === 0) {
        entries.push(buf.trim())
        buf = ""
        continue
      }
    }
    buf += ch
  }
  if (buf.trim()) entries.push(buf.trim())

  const obj: Record<string, unknown> = {}
  for (const entry of entries) {
    const ci = entry.indexOf(":")
    if (ci < 0) continue
    const key = entry.slice(0, ci).trim()
    const rawVal = entry.slice(ci + 1).trim()
    if (!key) continue
    obj[key] = parseYamlScalar(rawVal)
  }
  return Object.keys(obj).length > 0 ? obj : null
}

function parseYamlScalar(raw: string): unknown {
  if (raw === "") return ""
  if (raw === "true") return true
  if (raw === "false") return false
  if (raw === "null" || raw === "~") return null
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1)
  }
  if (raw.startsWith("{") && raw.endsWith("}")) {
    return parseYamlFlowMap(raw)
  }
  if (raw.startsWith("[") && raw.endsWith("]")) {
    const inner = raw.slice(1, -1).trim()
    if (!inner) return []
    const items: string[] = []
    let buf = ""
    let depthBrace = 0
    let depthBracket = 0
    let inSingle = false
    let inDouble = false
    for (let i = 0; i < inner.length; i++) {
      const ch = inner[i]
      if (ch === "'" && !inDouble) inSingle = !inSingle
      else if (ch === '"' && !inSingle) inDouble = !inDouble
      else if (!inSingle && !inDouble) {
        if (ch === "{") depthBrace++
        else if (ch === "}") depthBrace--
        else if (ch === "[") depthBracket++
        else if (ch === "]") depthBracket--
        else if (ch === "," && depthBrace === 0 && depthBracket === 0) {
          items.push(buf.trim())
          buf = ""
          continue
        }
      }
      buf += ch
    }
    if (buf.trim()) items.push(buf.trim())
    return items.map(parseYamlScalar)
  }
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    const n = Number(raw)
    if (Number.isFinite(n)) return n
  }
  return raw
}

/**
 * Parse a response body as an Xray-compatible subscription config. Tries, in
 * order: JSON (already-Xray outbounds), base64 URI list, plain URI list,
 * Clash-Meta YAML proxies.
 */
export function parseSubscriptionBody(body: string): { outbounds: XrayOutbound[] } {
  try {
    const parsed = JSON.parse(body)
    if (parsed?.outbounds && Array.isArray(parsed.outbounds)) {
      const proxies = filterProxyOutbounds(parsed.outbounds)
      if (proxies.length > 0) {
        return { outbounds: proxies }
      }
    }
  } catch {
    // not JSON, continue
  }

  try {
    const decoded = decodeBase64(body)
    const outbounds = parseProxyList(decoded)
    if (outbounds.length > 0) {
      return { outbounds }
    }
  } catch {
    // not base64, continue
  }

  const rawOutbounds = parseProxyList(body)
  if (rawOutbounds.length > 0) {
    return { outbounds: rawOutbounds }
  }

  if (body.includes("proxies:") || body.includes("\nproxies:")) {
    const clashOutbounds = parseClashYamlProxies(body)
    if (clashOutbounds.length > 0) {
      return { outbounds: clashOutbounds }
    }
  }

  throw new Error("Cannot parse subscription: not JSON, not a recognized proxy list format")
}

/** Normalize whatever the fetch layer returned into `{ outbounds: XrayOutbound[] }` or null. */
export function resolveSubscriptionData(
  data: unknown,
  rawBody?: string
): { outbounds: XrayOutbound[] } | null {
  if (hasUsableProxyOutbounds(data)) {
    const outbounds = filterProxyOutbounds((data as { outbounds: unknown[] }).outbounds)
    return { outbounds }
  }
  if (rawBody) {
    try {
      const parsed = parseSubscriptionBody(rawBody)
      if (hasUsableProxyOutbounds(parsed)) return parsed
    } catch {
      // fall through
    }
  }
  return null
}
