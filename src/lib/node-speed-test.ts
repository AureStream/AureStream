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

  try {
    return (await invoke("ping_tcp", {
      host: node.server,
      port: node.port,
      timeoutMs,
    })) as number
  } catch {
    return -1
  }
}
