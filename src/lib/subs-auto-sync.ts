/** Background subscription refresh policy (no manual UI). */

/** How often to pull remote subscriptions while logged in and idle. */
export const SUBS_SYNC_INTERVAL_MS = 30 * 60 * 1000

/** Ignore a scheduled tick if a successful sync happened more recently. */
export const SUBS_SYNC_MIN_GAP_MS = 60 * 1000

/** Connected or transitioning — do not refresh subscription data. */
export function isEngineBlockingSubsSync(state: string): boolean {
  return state === "running" || state === "starting" || state === "stopping"
}

export function shouldRunAutoSubsSync(opts: {
  hasUser: boolean
  engineState: string
  inFlight: boolean
  lastSuccessAt: number | null
  now: number
  /** When true, only enforce min-gap (e.g. login / restore). */
  ignoreInterval?: boolean
  intervalMs?: number
  minGapMs?: number
}): boolean {
  if (!opts.hasUser || opts.inFlight) return false
  if (isEngineBlockingSubsSync(opts.engineState)) return false

  const minGap = opts.minGapMs ?? SUBS_SYNC_MIN_GAP_MS
  if (
    opts.lastSuccessAt != null &&
    opts.now - opts.lastSuccessAt < minGap
  ) {
    return false
  }

  if (opts.ignoreInterval) return true

  const interval = opts.intervalMs ?? SUBS_SYNC_INTERVAL_MS
  if (opts.lastSuccessAt == null) return true
  return opts.now - opts.lastSuccessAt >= interval
}
