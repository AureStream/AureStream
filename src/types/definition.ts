/**
 * XTLS/Xray-core release tag (includes the "v" prefix).
 * Used by `scripts/download-binaries.ts` and subscription User-Agent.
 */
export const XRAY_VERSION = "v26.7.28";

export function buildSubscriptionUserAgent(): string {
  return `AureStream/${XRAY_VERSION}`;
}
