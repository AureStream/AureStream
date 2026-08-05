import { invoke } from "@tauri-apps/api/core"

export const NODE_SPEED_TEST_TIMEOUT_MS = 5000
/** Cap parallel TCP probes so large subscriptions stay responsive. */
export const NODE_SPEED_TEST_CONCURRENCY = 8

export type SpeedTestNode = {
  tag: string
  server: string
  port: number
}

/**
 * TCP connect latency to the node server (not full proxy handshake).
 * Returns ms on success, `-1` on timeout / error.
 */
export async function testNodeTcpLatency(
  node: SpeedTestNode,
  timeoutMs = NODE_SPEED_TEST_TIMEOUT_MS,
): Promise<number> {
  if (!node.server?.trim() || !node.port) return -1

  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const deadlineMs = Math.max(1, timeoutMs)
  const timeoutPromise = new Promise<number>((resolve) => {
    timeoutId = setTimeout(() => resolve(-1), deadlineMs)
  })

  const latencyPromise = invoke<number>("ping_tcp", {
    host: node.server.trim(),
    port: node.port,
    timeoutMs: deadlineMs,
  })
    .then((latency) => (typeof latency === "number" && latency > 0 ? latency : -1))
    .catch(() => -1)

  try {
    return await Promise.race([latencyPromise, timeoutPromise])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

/** Run probes with a fixed concurrency pool; calls `onResult` as each finishes. */
export async function testNodesTcpLatencyBatch(
  nodes: SpeedTestNode[],
  onResult: (tag: string, ms: number) => void,
  options?: { concurrency?: number; timeoutMs?: number },
): Promise<void> {
  const concurrency = Math.max(1, options?.concurrency ?? NODE_SPEED_TEST_CONCURRENCY)
  const timeoutMs = options?.timeoutMs ?? NODE_SPEED_TEST_TIMEOUT_MS
  let index = 0

  async function worker() {
    while (index < nodes.length) {
      const i = index
      index += 1
      const node = nodes[i]
      if (!node) continue
      const ms = await testNodeTcpLatency(node, timeoutMs)
      onResult(node.tag, ms)
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, nodes.length) }, () => worker())
  await Promise.all(workers)
}
