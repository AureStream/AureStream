# 状态管理

AureStream 采用轻量级的状态管理方案，结合 React Context API 与 Tauri 的跨语言通信机制，摒弃了 Redux 或 Zustand 等大型状态库。

## 1. 概述
- **React 层**: 使用内置的 Context API (`NavigationContext`, `SubscriptionContext`, `ThemeContext`)。
- **进程通信**: 通过 Tauri Event 机制实现 Rust 后端到前端的数据推流。
- **持久化层**: `settings.json` (轻量配置) + `data.db` (订阅与节点数据)。

## 2. NavigationContext
- 管理应用标签页导航状态。
- 维护 `activeTab` 属性 (`'home'` | `'subscription'` | `'settings'`)。
- 替代了传统的前端路由库，减少打包体积和复杂度。

## 3. SubscriptionContext
- **核心状态**: `subscriptions` (列表), `activeIdentifier` (当前选中项), `activeConfig` (配置详情), `nodes` (解析出的节点列表)。
- **状态行为**:
  - `parseNodes()`: 解析内核配置，过滤掉 `selector`/`urltest`/`direct`/`block`/`dns` 等非真实节点。
  - `selectSubscription()`: 切换订阅时带有引擎状态守卫 (Guard)，要求引擎处于 Idle 状态。
- **定时更新**: 每 10 分钟触发轮询器，检查各订阅的更新策略。如果引擎在运行中，更新后会热重载 (Hot-reload) 配置。

## 4. ThemeContext
- 维护主题模式: `system` | `light` | `dark`。
- 持久化保存在 `localStorage` 中。
- 监听系统 `prefers-color-scheme` 的事件并响应更新。

## 5. 引擎状态 (useEngineState)
- **事件监听**: 订阅 Tauri 的 `engine-state` 事件流。
- **可辨识联合类型**: 引擎状态类型定义为 `idle` | `starting` | `running` | `stopping` | `failed`。
- **提供动作**: `start(configPath, mode)`, `stop()`, `clearError()`。
- 将后端的 Rust State Machine 反映到前端 UI。

## 6. 配置存储 (single/store.ts)
- 基于 `tauri-plugin-store` 的 `LazyStore('settings.json')`。
- 包装了 30 多个 Getter/Setter 对，处理自动保存。
- 涵盖操作系统语言检测（回退到 zh/en）、自定义路由规则存储、DNS 服务器偏好设置等。

## 7. 数据库层 (single/db.ts)
- 基于 `tauri-plugin-sql` 操作 SQLite。
- 表结构: `subscriptions` 和 `subscription_configs`，通过级联删除维护数据一致性。

## 8. 引擎状态守卫 (Engine Guards)
- 定义在 `src/lib/engine-guard.ts` 和 `require-engine-idle.ts`。
- **拦截器机制**: 在执行切换订阅、更新订阅、修改核心端口等可能引起网络中断的操作前，如果 `isEngineBusy()`，则弹窗拦截，要求用户手动断开连接后再试。
