# 动态无缝节点切换实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在应用运行中实现基于 Clash API 的无缝节点切换，避免 TUN 模式下 SIGHUP 信号重载导致网口冲突崩溃。

**Architecture:** 
- 在 [hot-reload-config.ts](file:///Users/wry/IdeaProjects/AureStream/src/lib/hot-reload-config.ts) 中实现动态节点切换逻辑，引擎未运行或 API 失败时采取优雅降级策略。
- 替换 [NodesPage.tsx](file:///Users/wry/IdeaProjects/AureStream/src/components/NodesPage.tsx) 里的节点选中点击事件处理，使用新方法进行动态切换。

**Tech Stack:** TypeScript, React, Tauri, Clash API (RESTful)

---

### Task 1: 新增 `switchNodeActive` 核心节点切换方法

**Files:**
- Modify: `src/lib/hot-reload-config.ts`

- [ ] **Step 1: 在 `src/lib/hot-reload-config.ts` 中引入 API 依赖**
  在文件头部引入 `selectProxyNode` 方法：
  ```typescript
  import { selectProxyNode } from "@/utils/singbox-api/proxies"
  ```

- [ ] **Step 2: 实现并导出 `switchNodeActive` 函数**
  在文件尾部（例如第 74 行后）实现并导出该函数：
  ```typescript
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
  ```

- [ ] **Step 3: 检查编译**
  确认语法无误，函数正确被引出。

- [ ] **Step 4: 提交提交代码**
  ```bash
  git add src/lib/hot-reload-config.ts
  git commit -m "feat: add switchNodeActive for seamless node switching"
  ```

---

### Task 2: 对接前端节点页面切换行为

**Files:**
- Modify: `src/components/NodesPage.tsx`

- [ ] **Step 1: 修改 `src/components/NodesPage.tsx` 导入项**
  将 `hotReloadIfRunning` 替换为新方法 `switchNodeActive`：
  ```diff
  -import { hotReloadIfRunning } from "../lib/hot-reload-config"
  +import { switchNodeActive } from "../lib/hot-reload-config"
  ```

- [ ] **Step 2: 修改节点卡片点击 onClick 回调**
  定位到 `NodesPage.tsx` 的第 230-236 行，将 `hotReloadIfRunning` 改为调用 `switchNodeActive`：
  ```diff
                  onClick={async () => {
                    setConnectedNodeId(node.id)
                    if (activeSubId) {
                      const key = selectedNodeTagStoreKey(activeSubId)
                      await setStoreValue(key, node.id, { immediate: true })
  -                   await hotReloadIfRunning(activeSubId)
  +                   await switchNodeActive(activeSubId, node.id)
                    }
                  }}
  ```

- [ ] **Step 3: 提交代码**
  ```bash
  git add src/components/NodesPage.tsx
  git commit -m "feat: switch NodesPage onClick to switchNodeActive"
  ```

---

### Task 3: 构建与集成验证

- [ ] **Step 1: 运行前端构建进行类型与语法检查**
  运行：`pnpm build`
  期望：编译成功无类型错误。

- [ ] **Step 2: 提交最终修改**
  如果验证阶段有微调，一并提交。
  ```bash
  git commit --amend --no-edit # 或提交额外的微调
  ```
