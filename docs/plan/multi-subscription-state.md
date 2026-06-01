# 多订阅状态与节点切换

## 行为约定

- **单一活跃订阅**：`selected_subscription_identifier`（store）为全局活跃订阅；配置合并、连接、节点列表均只使用该订阅。
- **共享 React 状态**：`SubscriptionProvider`（`App.tsx` 根级）保证首页与订阅页读到同一份 `activeIdentifier` / `nodes`。
- **按订阅记忆节点**：store 键 `selected_node_tag:<identifier>`；旧全局键 `selected_node_tag` 在首次读取时若与当前列表匹配则迁移。
- **断开时切换订阅**：立即更新节点列表与 remembered 节点；测速缓存清空。
- **已连接时切换订阅**：`selectSubscription` 弹出提示「请先断开连接后再切换订阅」，不修改活跃订阅。
- **节点 API**：仅在引擎 `running` 时调用 `selectProxyNode` / 轮询 `fetchSelectGroup`。

## 验证

1. 添加两个订阅，在订阅页切换「使用中」→ 首页节点列表应立即对应该订阅。
2. 在订阅 A 选节点、切到订阅 B 再切回 A → 应恢复 A 上次所选节点。
3. 连接中在订阅页点另一订阅 → 应提示需先断开，节点与连接配置不变。
4. 断开后切换订阅再连接 → 应使用新订阅合并出的 `config.json`。
