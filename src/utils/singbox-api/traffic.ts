import type { SingBoxTrafficTick } from "@/types/singbox"
import { getControllerAuth } from "./client"

/**
 * Stream GET /traffic (newline-delimited JSON) from sing-box clash_api.
 * @see https://sing-box.sagernet.org/configuration/experimental/clash-api/
 */
export async function subscribeTraffic(
  onTick: (tick: SingBoxTrafficTick) => void,
  signal?: AbortSignal
): Promise<void> {
  const { baseUrl, secret } = await getControllerAuth()
  const res = await fetch(`${baseUrl}/traffic`, {
    headers: { Authorization: `Bearer ${secret}` },
    signal,
  })
  if (!res.ok || !res.body) {
    throw new Error(`traffic stream failed: HTTP ${res.status}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      while (true) {
        const pos = buffer.indexOf("\n")
        if (pos < 0) break
        const line = buffer.slice(0, pos).trim()
        buffer = buffer.slice(pos + 1)
        if (!line) continue
        try {
          const data = JSON.parse(line) as { up?: number; down?: number }
          onTick({
            up: data.up ?? 0,
            down: data.down ?? 0,
          })
        } catch {
          // skip malformed line
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
