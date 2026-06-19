# 节点延迟数据库缓存设计 (Node Latency Database Cache Design)

## 目标 (Goal)
将所有测试过的节点延迟（Latency / Ping）缓存到 SQLite 本地数据库中，使得应用在重启后仍能显示上一次测试的延迟，避免用户每次打开应用或切换页面都必须重新进行速度测试。

## 方案对比 (Approaches)

### 方案 1: 内存缓存 + 异步数据库读写 (Memory Cache + Async DB Sync) — 推荐
* **设计**: 
  1. 在应用启动时（在 `App.tsx` 中），调用 `initNodeLatency()` 异步地从 SQLite 数据库表 `node_latencies` 加载所有节点的延迟记录到内存 `Map` 中。
  2. `getNodeLatency(tag)` 保持同步，直接从内存中读取。这保证了前端 React 组件在渲染时可以无缝、即时地读取延迟，无需修改任何组件的渲染逻辑。
  3. `setNodeLatency(tag, ms)` 保持同步更新内存，并以非阻塞的异步方式向 SQLite 数据库写入更新（`INSERT OR REPLACE`）。
  4. `clearNodeLatency()` 清空内存，并异步清空数据库表。
* **优点**: 零渲染延迟，完全兼容现有前端代码，无需重构现有 React 组件为 async 模式，对性能无任何负面影响。
* **缺点**: 启动时需要一次性进行少量的数据库读取（数据量极小，通常小于数百行，耗时 < 5ms）。

### 方案 2: 纯异步数据库读写 (Pure Async DB Calls)
* **设计**: 将 `getNodeLatency` 改为 async 并返回 Promise，每次读取都直接从数据库中查询。
* **优点**: 内存中不保存状态。
* **缺点**: React 渲染不支持直接 await async 函数，必须重构 `NodesPage.tsx` 和 `Dashboard.tsx`，引入大量的 `useState`/`useEffect` 来异步获取和缓存每个节点的延迟，极大增加了组件复杂度和冗余渲染。

## 详细设计 (Detailed Design)

### 1. 数据库迁移 (Database Migration)
在 `src-tauri/src/app/database.rs` 中新增版本 2 的迁移：
```rust
const SQL_2: &str = r#"
CREATE TABLE node_latencies (
    tag TEXT PRIMARY KEY,
    latency INTEGER NOT NULL,
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);
"#;
```

### 2. Node Latency 模块重隔 (Refactoring node-latency.ts)
重写 [node-latency.ts](file:///Users/wry/IdeaProjects/AureStream/src/lib/node-latency.ts)，加入初始化及异步数据库同步逻辑：
- `initNodeLatency()`: 异步读取数据库所有延迟，载入内存。
- `setNodeLatency(tag, ms)`: 内存更新 + 异步写入数据库。
- `clearNodeLatency()`: 内存清空 + 异步清空数据库。

### 3. 应用入口初始化 (App Initialization)
在 [App.tsx](file:///Users/wry/IdeaProjects/AureStream/src/App.tsx) 的根组件中使用 `useEffect` 调用 `initNodeLatency()` 进行后台初始化。

## 验证计划 (Verification Plan)
1. 启动本地开发环境，进入「节点列表」进行速度测试（测延迟）。
2. 关闭应用并重新启动。
3. 检查重新启动后，节点列表是否能够立刻显示刚才测试出的延迟值（不需要重新测速）。
4. 切换节点，检查主页的节点延迟是否能够正确保存与恢复。
