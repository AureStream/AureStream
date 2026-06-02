import type { SingBoxProxyGroup } from "@/types/singbox"
import { controllerFetch } from "./client"

/** GET /proxies/ExitGateway — current selector outbound group. */
export async function fetchSelectGroup(): Promise<SingBoxProxyGroup | null> {
  try {
    const res = await controllerFetch("/proxies/ExitGateway")
    if (!res.ok) {
      console.error(`[singbox-api] fetchSelectGroup: HTTP ${res.status} ${res.statusText}`)
      return null
    }
    return (await res.json()) as SingBoxProxyGroup
  } catch (e) {
    console.error("[singbox-api] fetchSelectGroup failed:", e)
    return null
  }
}

/** PUT /proxies/ExitGateway — switch active node in selector group. */
export async function selectProxyNode(nodeName: string): Promise<boolean> {
  try {
    const res = await controllerFetch("/proxies/ExitGateway", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nodeName }),
    })
    if (!res.ok) {
      console.error(`[singbox-api] selectProxyNode("${nodeName}"): HTTP ${res.status} ${res.statusText}`)
    }
    return res.ok
  } catch (e) {
    console.error(`[singbox-api] selectProxyNode("${nodeName}") failed:`, e)
    return false
  }
}

/** GET /proxies/{name}/delay — URL test latency (ms), -1 on failure. */
export async function testNodeDelay(
  nodeName: string,
  testUrl = "http://www.gstatic.com/generate_204",
  timeoutMs = 3000
): Promise<number> {
  try {
    const params = new URLSearchParams({
      timeout: String(timeoutMs),
      url: testUrl,
    })
    const res = await controllerFetch(
      `/proxies/${encodeURIComponent(nodeName)}/delay?${params}`
    )
    if (!res.ok) return -1
    const data = (await res.json()) as { delay?: number }
    return data.delay ?? -1
  } catch (e) {
    console.error(`[singbox-api] testNodeDelay(${nodeName}) failed:`, e)
    return -1
  }
}
