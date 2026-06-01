export { PROXY_BYPASS_STORE_KEY } from "@/types/definition"

/** Default bypass list shown in settings (comma-separated, cross-platform friendly). */
export const DEFAULT_PROXY_BYPASS_UI =
  "localhost, 127.0.0.1, ::1, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, *.local, <local>"

/** Normalize user input: trim entries, drop empties. */
export function normalizeBypassInput(raw: string): string {
  return raw
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(", ")
}

/** Windows sysproxy expects semicolon-separated bypass. */
export function bypassForWindows(commaSeparated: string): string {
  return normalizeBypassInput(commaSeparated).replace(/, /g, ";")
}

/** macOS / Linux use comma-separated lists in sysproxy-rs. */
export function bypassForUnix(commaSeparated: string): string {
  return normalizeBypassInput(commaSeparated)
}
