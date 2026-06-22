import { invoke } from "@tauri-apps/api/core"

export const NODE_SPEED_TEST_TIMEOUT_MS = 5000

export type SpeedTestNode = {
  id: string
  server: string
  port: number
}

export async function testNodeTcpLatency(
  node: SpeedTestNode,
  timeoutMs = NODE_SPEED_TEST_TIMEOUT_MS,
): Promise<number> {
  if (!node.server || !node.port) return -1

  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const deadlineMs = Math.max(1, timeoutMs)
  const timeoutPromise = new Promise<number>((resolve) => {
    timeoutId = setTimeout(() => resolve(-1), deadlineMs)
  })

  const latencyPromise = invoke("ping_tcp", {
    host: node.server,
    port: node.port,
    timeoutMs,
  })
    .then((latency) => latency as number)
    .catch(() => -1)

  try {
    return await Promise.race([latencyPromise, timeoutPromise])
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }
}
