import { invoke } from "@tauri-apps/api/core"

import { getConfigJsonPath } from "@/lib/app-paths"
import { mergeConnectionConfig } from "@/lib/connection-config"
import { invalidateConnectionConfigCache } from "@/lib/merge-cache"
import { perf } from "@/lib/perf"
import {
  ROUTING_MODE_KEY,
  normalizeRoutingMode,
  type RoutingMode,
} from "@/lib/routing-mode"
import { flushStore, getEnableTun, getStoreValue } from "@/single/store"
import { SSI_STORE_KEY } from "@/types/definition"
import { getEngineState } from "@/utils/vpn-service"
import { invalidateControllerClientCache } from "@/utils/singbox-api/controller-cache"
import { selectProxyNode } from "@/utils/singbox-api/proxies"

export async function isEngineRunning(): Promise<boolean> {
  const state = await getEngineState()
  return state.kind === "running"
}

/** Rebuild config.json and hot-reload sing-box without disconnecting. */
export async function hotReloadConnectionConfig(
  subscriptionIdentifier: string,
  routingMode?: RoutingMode,
  enableTun?: boolean
): Promise<void> {
  if (!subscriptionIdentifier) {
    throw new Error("subscription_identifier_missing")
  }

  await perf.run("hot-reload.total", async () => {
    invalidateConnectionConfigCache()

    const routing =
      routingMode ??
      normalizeRoutingMode(await getStoreValue(ROUTING_MODE_KEY, "rule"))
    const tun = enableTun ?? (await getEnableTun())

    const merged = await perf.run("hot-reload.merge", () =>
      mergeConnectionConfig(subscriptionIdentifier, routing, tun, { force: true })
    )
    if (merged) {
      const configPath = await getConfigJsonPath()
      await invoke("mark_config_verified", { configPath })
    }
    await flushStore()
    await perf.run("hot-reload.invoke", () => invoke("reload_config"))
  })

  invalidateControllerClientCache()
}

/** Hot-reload when engine is running; no-op when idle. Returns whether reload ran. */
export async function hotReloadIfRunning(
  subscriptionIdentifier?: string,
  routingMode?: RoutingMode,
  enableTun?: boolean
): Promise<boolean> {
  if (!(await isEngineRunning())) {
    return false
  }

  const identifier =
    subscriptionIdentifier ||
    ((await getStoreValue(SSI_STORE_KEY, "")) as string)
  if (!identifier) {
    return false
  }

  await hotReloadConnectionConfig(identifier, routingMode, enableTun)
  return true
}

/**
 * 动态无缝切换正在运行中的 sing-box 节点。
 * 若引擎运行中，优先使用 Clash API 进行选择切换并静默更新磁盘配置；
 * 若 API 切换失败，则自动降级回退到全量热重载（SIGHUP/重启）。
 */
export async function switchNodeActive(
  subscriptionIdentifier: string,
  nodeId: string
): Promise<boolean> {
  const isRunning = await isEngineRunning()

  if (!isRunning) {
    // 1. 如果引擎未运行，仅生成并更新磁盘配置文件 config.json，以便下次启动时生效
    const routing = normalizeRoutingMode(await getStoreValue(ROUTING_MODE_KEY, "rule"))
    const tun = await getEnableTun()
    await mergeConnectionConfig(subscriptionIdentifier, routing, tun, { force: true })
    const configPath = await getConfigJsonPath()
    await invoke("mark_config_verified", { configPath })
    await flushStore()
    return false
  }

  // 2. 引擎运行中，尝试调用 Clash API 动态切换当前 ExitGateway 节点
  const apiSuccess = await selectProxyNode(nodeId)

  if (apiSuccess) {
    console.info(`[hot-reload] 成功通过 Clash API 无缝切换节点至 "${nodeId}"`)

    // 3. 静默在后台将新节点保存进磁盘 config.json，不触发 SIGHUP 信号
    try {
      const routing = normalizeRoutingMode(await getStoreValue(ROUTING_MODE_KEY, "rule"))
      const tun = await getEnableTun()
      await mergeConnectionConfig(subscriptionIdentifier, routing, tun, { force: true })
      const configPath = await getConfigJsonPath()
      await invoke("mark_config_verified", { configPath })
      await flushStore()
    } catch (e) {
      console.warn("[hot-reload] 动态切换成功，但后台静默写入磁盘配置失败:", e)
    }
    return true
  }

  // 4. API 切换失败降级：回退到全量热重载（SIGHUP / 重启）
  console.warn(`[hot-reload] Clash API 切换节点 "${nodeId}" 失败，降级回退至全量热重载`)
  await hotReloadConnectionConfig(subscriptionIdentifier)
  return true
}
