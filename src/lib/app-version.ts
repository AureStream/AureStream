import packageJson from "../../package.json"

/** Normalize a project/app version for footer display (`v1.0.0`). */
export function formatAppVersionLabel(version: string): string {
  const trimmed = version.trim()
  if (!trimmed) return ""
  return trimmed.startsWith("v") || trimmed.startsWith("V")
    ? `v${trimmed.slice(1)}`
    : `v${trimmed}`
}

/** Default app version configured in package.json (e.g. `v1.0.4`). */
export const APP_VERSION = formatAppVersionLabel(packageJson.version)
