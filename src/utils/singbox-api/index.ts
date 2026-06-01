export { getControllerBaseUrl, controllerFetch } from "./client"
export { fetchSelectGroup, selectProxyNode, testNodeDelay } from "./proxies"
export { subscribeTraffic } from "./traffic"

/** TCP reachability via Tauri (not part of clash_api). */
export async function pingNodeTcp(host: string, port: number): Promise<number> {
  try {
    const { invoke } = await import("@tauri-apps/api/core")
    return await invoke<number>("ping_tcp", { host, port })
  } catch (e) {
    console.error(`[singbox-api] pingNodeTcp(${host}:${port}) failed:`, e)
    return -1
  }
}
