import { invoke } from "@tauri-apps/api/core"

/**
 * Live-switch the active proxy node via Xray's balancer override (Rust's
 * `select_node` command -> `xray api bo`), without restarting the process.
 * Replaces the sing-box-era `PUT /proxies/ExitGateway` Clash-API call.
 */
export async function selectProxyNode(nodeTag: string): Promise<boolean> {
  try {
    await invoke("select_node", { nodeTag })
    return true
  } catch (e) {
    console.error(`[xray-api] selectProxyNode("${nodeTag}") failed:`, e)
    return false
  }
}
