/** Normalize a project/app version for footer display (`v1.0.0`). */
export function formatAppVersionLabel(version: string): string {
  const trimmed = version.trim()
  if (!trimmed) return ""
  return trimmed.startsWith("v") || trimmed.startsWith("V")
    ? `v${trimmed.slice(1)}`
    : `v${trimmed}`
}
