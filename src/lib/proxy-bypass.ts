export { PROXY_BYPASS_STORE_KEY } from "@/types/definition"

const isWindows =
  typeof navigator !== "undefined" && /windows/i.test(navigator.userAgent)

const BYPASS_SEPARATOR = isWindows ? ";" : ","

export type BypassRuleSet = {
  domain: string[]
  domain_suffix: string[]
  ip_cidr: string[]
}

function bypassTokens(raw: string): string[] {
  return raw
    .split(/[,;，；\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Default bypass list shown in settings, using the platform's native separator. */
export const DEFAULT_PROXY_BYPASS_UI = isWindows
  ? "localhost; 127.*; 192.168.*; 10.*; 172.16.*; 172.17.*; 172.18.*; 172.19.*; 172.20.*; 172.21.*; 172.22.*; 172.23.*; 172.24.*; 172.25.*; 172.26.*; 172.27.*; 172.28.*; 172.29.*; 172.30.*; 172.31.*; <local>"
  : "localhost, 127.0.0.1, ::1, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, *.local, <local>"

/** Placeholder text for the bypass textarea. */
export const BYPASS_PLACEHOLDER = isWindows
  ? "localhost; 127.*; 192.168.*; 10.*"
  : "localhost, 127.0.0.1, 10.0.0.0/8"

/** Normalize user input for display and storage: trim entries, drop empties. */
export function normalizeBypassInput(raw: string): string {
  return bypassTokens(raw).join(`${BYPASS_SEPARATOR} `)
}

/** Value shown in settings: saved content if present, otherwise the platform default. */
export function resolveBypassDisplayValue(raw: string | undefined | null): string {
  const normalized = normalizeBypassInput(raw ?? "")
  return normalized || DEFAULT_PROXY_BYPASS_UI
}

/** Value persisted from settings, normalized to the platform separator. */
export function resolveBypassPersistValue(raw: string): string {
  return normalizeBypassInput(raw)
}

function isIpv4(token: string): boolean {
  const parts = token.split(".")
  return parts.length === 4 && parts.every((part) => {
    if (!/^\d+$/.test(part)) return false
    const n = Number(part)
    return n >= 0 && n <= 255
  })
}

function isIpv6(token: string): boolean {
  return token.includes(":") && /^[0-9a-fA-F:]+$/.test(token)
}

function isCidr(token: string): boolean {
  const [addr, prefix] = token.split("/")
  if (!addr || !prefix || !/^\d+$/.test(prefix)) return false
  const bits = Number(prefix)
  if (isIpv4(addr)) return bits >= 0 && bits <= 32
  if (isIpv6(addr)) return bits >= 0 && bits <= 128
  return false
}

function pushUnique(target: string[], value: string) {
  if (!target.includes(value)) target.push(value)
}

export function parseBypassInputToRuleSet(raw: string): BypassRuleSet {
  const rules: BypassRuleSet = { domain: [], domain_suffix: [], ip_cidr: [] }

  for (const token of bypassTokens(raw)) {
    if (token.startsWith("<") && token.endsWith(">")) continue

    if (isCidr(token)) {
      pushUnique(rules.ip_cidr, token)
    } else if (isIpv4(token)) {
      pushUnique(rules.ip_cidr, `${token}/32`)
    } else if (isIpv6(token)) {
      pushUnique(rules.ip_cidr, `${token}/128`)
    } else if (token.startsWith("*.")) {
      pushUnique(rules.domain_suffix, `.${token.slice(2)}`)
    } else if (token.startsWith(".")) {
      pushUnique(rules.domain_suffix, token)
    } else if (!token.includes("*")) {
      pushUnique(rules.domain, token)
    }
  }

  return rules
}

export function ruleSetToBypassInput(ruleSet: BypassRuleSet): string {
  return normalizeBypassInput([
    ...ruleSet.domain,
    ...ruleSet.domain_suffix,
    ...ruleSet.ip_cidr,
  ].join(", "))
}

/** Windows sysproxy expects semicolon-separated bypass. */
export function bypassForWindows(raw: string): string {
  return bypassTokens(raw).join(";")
}

/** macOS / Linux use comma-separated lists in sysproxy-rs. */
export function bypassForUnix(raw: string): string {
  return bypassTokens(raw).join(",")
}
