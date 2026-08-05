import { listen } from "@tauri-apps/api/event"

export interface TrafficTick {
  up: number
  down: number
}

const EVENT_TRAFFIC_TICK = "traffic-tick"

/**
 * Subscribe to traffic deltas emitted by the Rust engine (`xray_api::
 * spawn_traffic_poll`, ~1s cadence while running — polls Xray's
 * StatsService via `xray api statsquery -reset`). Replaces the sing-box-era
 * Clash-API traffic WebSocket; same `(onTick, signal)` shape so callers
 * don't need to change.
 */
export async function subscribeTraffic(
  onTick: (tick: TrafficTick) => void,
  signal?: AbortSignal
): Promise<void> {
  if (signal?.aborted) return

  const unlisten = await listen<TrafficTick>(EVENT_TRAFFIC_TICK, (event) => {
    onTick({
      up: event.payload.up ?? 0,
      down: event.payload.down ?? 0,
    })
  })

  if (signal) {
    if (signal.aborted) {
      unlisten()
      return
    }
    signal.addEventListener("abort", unlisten, { once: true })
  }
}
