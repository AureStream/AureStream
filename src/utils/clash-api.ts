import { getClashApiSecret } from "@/single/store"

const BASE_URL = "http://127.0.0.1:9191"

export interface ProxyItem {
  name: string
  type: string
  udp: boolean
  history: Array<{ time: string; delay: number }>
  delay?: number
}

export interface ProxyGroup {
  name: string
  type: string
  all: string[]
  now: string
}

export async function fetchSelectGroup(): Promise<ProxyGroup | null> {
  try {
    const secret = await getClashApiSecret()
    const res = await fetch(`${BASE_URL}/proxies/select`, {
      headers: {
        Authorization: `Bearer ${secret}`,
        Accept: "application/json",
      },
    })
    if (!res.ok) return null
    return await res.json() as ProxyGroup
  } catch (e) {
    console.error("Failed to fetch select group:", e)
    return null
  }
}

export async function selectProxyNode(nodeName: string): Promise<boolean> {
  try {
    const secret = await getClashApiSecret()
    const res = await fetch(`${BASE_URL}/proxies/select`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: nodeName }),
    })
    return res.ok
  } catch (e) {
    console.error("Failed to select proxy node:", e)
    return false
  }
}

export async function testNodeDelay(nodeName: string): Promise<number> {
  try {
    const secret = await getClashApiSecret()
    const url = `${BASE_URL}/proxies/${encodeURIComponent(nodeName)}/delay?timeout=3000&url=${encodeURIComponent(
      "http://www.gstatic.com/generate_204"
    )}`
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${secret}`,
      },
    })
    if (!res.ok) return -1
    const data = await res.json() as { delay: number }
    return data.delay || -1
  } catch (e) {
    console.error(`Failed to test delay for ${nodeName}:`, e)
    return -1
  }
}

export async function pingNodeTcp(host: string, port: number): Promise<number> {
  try {
    const { invoke } = await import("@tauri-apps/api/core")
    const delay = await invoke<number>("ping_tcp", { host, port })
    return delay
  } catch (e) {
    console.error(`Failed to TCP ping ${host}:${port}:`, e)
    return -1
  }
}
