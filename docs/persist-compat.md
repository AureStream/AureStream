# 跨版本数据兼容

应用数据目录里的 JSON **比写出它的版本活得更久**。升级后旧文件必须仍能加载；改字段、改节点主键时，不能把用户装进「节点不存在」或起不来。

实现以代码为准：读写契约在 `src-tauri/src/persist.rs`，节点身份在 `src-tauri/src/node_key.rs`。内核（`crates/aurestream-engine`、订阅 decode、Xray JSON）不参与这套兼容。

## 1. 硬规则

所有壳层 JSON 都走 `persist.rs`，遵守四条：

1. **读侧每个字段都可缺省。** `#[serde(default)]`，禁止 `deny_unknown_fields`。旧文件缺字段、新文件多未知字段，都能加载。
2. **读失败永不阻断启动。** 损坏或不兼容的文件改名为 `*.corrupt-<ts>`，返回默认值。用户不能修一个起不来的应用里的 JSON。
3. **写必须原子。** 先写同目录临时文件再 rename。崩溃或磁盘满不能留下截断文件。
4. **身份只加不换。** 已有字段禁止改含义。含义变了就新开字段，旧字段继续可读。节点主键带前缀；换算法时新前缀 + 旧算法留在 `aliases()`。读接受任意历史别名，成功解析后按**当前**格式回写。

`schemaVersion` 只作文档，不是迁移引擎。单纯加字段不用加版本。

## 2. 落盘清单

应用数据目录（Tauri `app_data_dir`）：

| 文件 | 模块 | 1.0.0 写出 | 当前写出 | 读兼容 |
|---|---|---|---|---|
| `engine-selection.json` | `commands/engine.rs` | 仅 `selectedNode`（展示名） | `schemaVersion` + `selectedKey`（`n2:` 哈希）+ `selectedEndpoint` + 当前展示名 | 认 1.0.0 仅 tag、1.0.1 明文 `protocol\|host\|port\|secret`、当前哈希；未知字段忽略 |
| `subs.json` | `state.rs` | 节点无稳定 `id`，`nodes` 当缓存 | `schemaVersion` + 带 `id` 的节点列表 + 原始 `bodies` | 启动用 `bodies` 按当前解码重算 `nodes`；解码出空则保留旧列表 |
| `auth-session.json` | `state.rs` | 字段全当必填 | 同左，读侧全部缺省 | 缺 token 视为未登录，不阻断启动；未知字段忽略 |
| `engine-runtime.json` | `commands/engine.rs` | 独立严解析 | 同走 `persist.rs` | 解析失败隔离，当「没有这份标记」 |

前端 `localStorage`（不走 `persist.rs`，但遵守同一身份纪律）：

| 键 | 用途 | 兼容 |
|---|---|---|
| `aurestream.node-latencies.v1` | 节点 TCP 延迟 | 现按稳定 `id` 读写；读侧仍认旧的 tag 键 |
| `aurestream.pref.*` | 智能分流 / 虚拟网卡等偏好 | 独立 bool，缺省即默认值 |
| `aurestream.auth.remember` | 记住登录勾选 | 独立 bool |

内核每次启动覆盖自己的配置文件，不在本契约内。

## 3. 节点身份

展示名（`tag` / `name`）由供应商控制，常被改成带实时速度的文案（`电信-60.48mb/s`）。**不能当主键。**

当前写出：`n2:` + FNV-1a-128（输入为 `protocol|host|port|secret`）。哈希里不带凭证，可以交给前端。

读入时 `key_matches` 接受该节点历史上每一种形式，目前是：

| 前缀 / 形态 | 写出版本 | 内容 | 现在还写吗 |
|---|---|---|---|
| `n2:<32 hex>` | 当前 | 上述元组的哈希 | 是 |
| `protocol\|host\|port\|secret` | 1.0.1 | 明文元组 | 否（磁盘不再存 uuid/password） |

以后再换算法：新前缀，旧 builder 留在 `aliases()`，禁止删除。成功解析后 `set_selected` 回写成当前三件套：`selectedKey`、`selectedEndpoint`（`protocol|server|port`）、当前展示名。

查找阶梯（`pick_node`），强到弱：

1. 当前身份及历史别名
2. 调用方带来的第二个身份（记住的选择，避免过期 UI id 把它盖住）
3. 展示名（精确，再 sanitised / `name`）——只为 1.0.0 仅有 tag 的文件
4. 端点 `protocol|server|port`——同一台机器换了凭证
5. 第一个节点——仅「需要连上」的路径（首页连接、托盘、记住的选择）。节点列表上的点击禁止静默连到别的节点

1.0.0 只有展示名：供应商改名后无法找回原节点，回退到列表第一项。这是格式信息不足，不是漏网。

## 4. 启动与同步时回写

`SubsState` 与 `EngineAppState` 都 load 完之后跑 `reconcile_persisted_state`；每次 `subs_sync` 成功后再跑一次并推 `engine-state`。

- 有订阅 body：按当前解码重建节点，用上一节阶梯解析记住的选择，成功则按当前格式回写选择文件。
- 无节点 / 无订阅：不动磁盘上的旧选择。
- `subs.json` 的 `nodes` 只是 `bodies` 的视图。解码出空列表时保留缓存（包括 1.0.0 没有 `id` 的条目），避免一次回归把列表清空。

## 5. 前端纪律

- 列表选中态、测速缓存、传给引擎的主键：只用稳定 `id`。
- `resolveSelectedNode` 用于展示：id → tag → 列表第一项。
- `confirmedSelection` 用于连接参数：对不上当前列表就返回 `null`，**不要**用记住的旧名字造一个不在列表里的节点。
- 首页连接：只有 `confirmedSelection` 有值时才传 `nodeId` / `nodeTag`；否则不传，后端走记住的选择 + 回退。

1.0.1 曾在后端做了身份恢复，但首页把过期展示名当成明确选择送进 `engine_start`，恢复逻辑走不到。新代码禁止再走这条路。

## 6. 能挡住什么

| 改动 | 没有契约 | 有这套契约 |
|---|---|---|
| 给 JSON 加字段 | 旧文件缺字段，新版解析失败或当必填 | 缺省加载 |
| 新版多写未知字段 | 旧版严解析拒读 | 忽略未知字段 |
| 换节点身份算法 | 磁盘上的旧 key 全部孤儿化 | 旧算法留在 `aliases()`，读懂后再写成新格式 |
| 供应商改展示名 | 用名字当主键，报「节点不存在」 | 名字只显示 |
| 文件写到一半 / 手改坏了 | setup 失败，应用起不来 | 隔离坏文件，当没有这份状态 |
| 缓存的 `nodes` 和当前解码不一致 | UI 拿旧 tag/id 去开引擎 | 启动用 body 重算 |

## 7. 挡不住什么

- 订阅里那个节点真的没了（供应商删节点，或机器和凭证一起换了）。回退到第一个节点是产品行为。
- 有人把已有字段改了含义却不改名。测试发现不了「同名不同义」，必须新开字段。
- 升级回写为当前格式后，再装回更老的 1.0.1：它不认识 `n2:` 哈希。保证降级能打开、不当场崩，不保证仍选中同一节点。
- 内核 decode / Xray JSON 自己变了。本契约不管内核。同一份 body 若解出非空的另一批节点，壳层采用新结果；解出空才保留旧缓存。

## 8. 以后改落盘数据

1. 新字段：只加、给 `#[serde(default)]`、不删旧字段、不加 `deny_unknown_fields`。
2. 字段含义变了：新开字段名，旧字段继续读，不再作为写出主键。
3. 换节点身份：新前缀 + 把现行 `node_key` 挪进 `aliases()`，禁止删旧 builder。
4. 在对应模块补一条黄金夹具：旧形状仍能加载 / 解析；当前形状 round-trip；「未来」未知字段仍能加载；截断 JSON 被隔离。
5. 不要为某一个报错在 `engine_start` 里再加特殊分支。查找只走 `pick_node` 阶梯。

锁死历史形状的测试入口：

- `src-tauri/src/persist.rs`：读写、损坏隔离、新旧字段
- `src-tauri/src/node_key.rs`：哈希稳定、1.0.1 明文仍匹配
- `src-tauri/src/commands/engine.rs`：`selection_fixtures_from_every_shipped_format_still_resolve` 等
- `src-tauri/src/state.rs`：1.0.0 `subs.json` / 会话文件仍能加载
- `src/lib/node-selection.test.ts`：前端不得发明幽灵节点
