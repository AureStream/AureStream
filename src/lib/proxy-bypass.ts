export { PROXY_BYPASS_STORE_KEY } from "@/types/definition"

const isWindows =
  typeof navigator !== "undefined" && /windows/i.test(navigator.userAgent)

const BYPASS_SEPARATOR = isWindows ? ";" : ","

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

/** Windows sysproxy expects semicolon-separated bypass. */
export function bypassForWindows(raw: string): string {
  return bypassTokens(raw).join(";")
}

/** macOS / Linux use comma-separated lists in sysproxy-rs. */
export function bypassForUnix(raw: string): string {
  return bypassTokens(raw).join(",")
}
