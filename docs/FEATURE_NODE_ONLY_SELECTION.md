# 仅「选节点」模式：功能设计与实现方案

**目标读者**：产品与开发  
**前提**：AureStream 产品层**不展示、不操作代理组**；用户只从**扁平节点列表**里选一个出口，由应用负责与 Mihomo 内部「组」对接。

---

## 1. 目标与约束

### 1.1 产品目标

- 首页/节点弹层只出现**可理解的节点行**（名称、延迟、可选地区标签），**不出现**「代理组 / 策略组 / 自动选择」等概念。
- 用户点选一行即视为「当前使用的节点」；连接后 Mihomo 实际走该节点。
- 与设计文档一致：左栏节点胶囊、`NodePickerDialog` 玻璃对话框、延迟色与一键测速。

### 1.2 技术现实（Mihomo）

- 配置里**几乎一定存在代理组**（`Selector` / `URLTest` 等），规则里的 `MATCH` 等往往指向某个**组**，而不是直连某个叶子代理名。
- `tauri-plugin-mihomo` **可以**拿到节点侧数据：`getProxies()`、`getGroups()`、`selectNodeForGroup(groupName, nodeName)`、`delayProxyByName` 等。
- 因此「不支持代理组」= **UI 不做组**，**后台仍须指定一个「主出口组」**，把用户选的叶子代理写进该组。

---

## 2. 总体方案（推荐）

采用 **「单一主出口组 + 扁平叶子列表」**：

1. **主出口组** `mainGroupName`：在 Mihomo 里作为用户选节点的挂载点（每次用户切换节点 → 对该组调用 `selectNodeForGroup`）。
2. **扁平列表**：只展示「叶子代理」（可连的那类 `type`），不展示组。
3. **数据双轨（择一为主，另一兜底）**：

- **优先 A（推荐）**：内核已启动并成功 `reload` 当前订阅后，用 `**getProxies()` / `getGroups()`\*\* 拉取实时结构，推导叶子代理与合法 `nodeName`。
- **兜底 B**：订阅下载保存 YAML 后，在 Rust 侧解析 `proxies:` 段落，写入本地 `nodes` 表，供未连接时展示与测速（与现有 `Node` 类型对齐）；连接后再以 A 校准名称。

这样与现有 **Zustand `currentNode` + `NodePickerDialog`** 一致，只需把 **列表数据源** 从「空表」改为「API 或解析结果」。

---

## 3. 主出口组 `mainGroupName` 的确定策略

订阅差异大，建议 **多级回退**（按顺序尝试，成功则锁定到本次运行或持久化到本地设置）：

1. **用户设置（最高优先级）**
   设置页增加可选项：「主策略组名称」，高级用户手动填 Mihomo 里真实组名（如 `🔰 节点选择`、`PROXY`）。
2. **规则推断**
   对当前配置调用 `getRules()`（若插件/API 暴露）或读取已加载配置的 rules，找到 `**MATCH`\*\* 所指的那一项，若为 `Selector`，其名字可作为 `mainGroupName` 候选。
3. `**getGroups()` 推断\*\*

- 优先：`type === Selector`（或等价）且 `**all`\*\* 中包含最多「叶子代理名」的组；
- 或：名称命中常见关键字（如 `SELECT`、`节点选择`、`PROXY`，可配置同义词表）。

4. **硬编码默认**
   最后尝试 `PROXY`、`Proxy`、`GLOBAL` 等（易误伤，仅作兜底）。

**持久化**：解析成功后把 `mainGroupName` 存 `appStore` + 可选 `localStorage`/Rust settings，下次启动直接用；若 `selectNodeForGroup` 返回错误则重新走推断。

---

## 4. 扁平「节点列表」的生成

### 4.1 基于 `getProxies()`（内核在线）

- 遍历 `proxies` 字典，按 `type` 过滤：
  - **排除**（不展示为可选节点）：`Direct`、`Reject`、`Selector`、`URLTest`、`Relay`、`LoadBalance`、`Fallback` 等（以 Mihomo 文档为准维护白名单/黑名单）。
  - **保留**：`Shadowsocks`、`Vmess`、`Vless`、`Trojan`、`Hysteria`、`WireGuard` 等具体协议。
- `id`：建议稳定键 = **Mihomo 代理名**（配置里 `name`，与 `selectNodeForGroup` 第二个参数一致）。
- `name`：展示名 = 代理名（或后续做去 emoji/截断 UI）。
- `server` / `port`：若 API 返回则填；否则仅展示名称。

### 4.2 基于 YAML 解析（内核未启动或兜底）

- 解析订阅/运行配置中 `proxies:` 数组每项的 `name`、`type`、`server`、`port`。
- 同样按 `type` 过滤组类型；**组内嵌套**若存在，首版可只列顶层 `proxies`，与多数订阅一致。

---

## 5. 与现有 UI / 状态的对齐

| 现有能力           | 调整                                                                                                                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NodePickerDialog` | `list` 改为来自 **API 或解析** 的扁平列表；`handlePick` 内除 `setCurrentNode` 外，若 **已连接** 则 `await selectNodeForGroup(mainGroupName, node.name)`。                     |
| 左栏节点胶囊       | 仍绑定 `currentNode`；展示名、延迟与插件 `delayProxyByName` 或本地缓存一致。                                                                                                  |
| 一键测速           | 对已连接：对当前列表逐个 `delayProxyByName(name, testUrl, timeout)`，写回 store；未连接可只对 YAML 解析出的 server:port 做 TCP 测速（现有 `test_node_latency`）或提示先连接。 |
| `connect()`        | 连接成功并 `reload` 后：**解析 `mainGroupName`**；若尚无 `currentNode`，可默认选列表第一项或上次记忆；并执行一次 `selectNodeForGroup`。                                       |

---

## 6. 实现阶段建议

**阶段 1（最小可用）**

- 连接后拉 `getProxies()`，生成扁平列表，`NodePickerDialog` 可用的节点不为空。
- 实现 `resolveMainGroupName()`（设置项 + `getGroups` 简单启发式）。
- 选节点 → `selectNodeForGroup(mainGroupName, proxyName)`。

**阶段 2**

- 设置页「主策略组名称」与规则推断。
- 订阅下载后 YAML 解析写 `nodes` 表，未连接也可浏览节点（与设计「导入订阅后查看」一致）。

**阶段 3**

- 延迟与内核统一：优先 `delayProxyByName`；离线 TCP 兜底。
- 多订阅并存时：`currentProvider` 切换 → 清空或重绑 `currentNode`，重新拉取该订阅对应配置的 proxies（取决于是否多配置实例；当前架构为单次 `reload` 单文件则需约定「当前只用当前服务商配置」）。

---

## 7. 风险与注意点

- **订阅自定义组名**：无设置时推断可能失败 → 必须有设置项与清晰错误文案（「请在设置中填写主策略组名称」）。
- **代理名重复**：极少见；以 Mihomo 内部唯一名为准。
- `**URLTest` 组**：产品若完全隐藏组，用户选叶子后仍应对 **Selector\*\* 类主组操作；不要将 `URLTest` 当成用户直接切换对象，除非只做只读展示自动结果（首版可不展示）。

---

## 8. 结论

**可以**在不暴露代理组的前提下完成「只选节点」：**对外扁平列表 + 对内 `selectNodeForGroup(mainGroupName, leafProxyName)`**。  
数据源以 `**tauri-plugin-mihomo` 的 `getProxies` / `getGroups**` 为主，YAML 解析为辅，并与现有仪表盘、对话框、连接流程渐进对齐。
