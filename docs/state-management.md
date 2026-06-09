# 状态管理

AureStream 采用轻量级的状态管理方案，结合 React Context API 与 Tauri 的跨语言通信机制，摒弃了 Redux 或 Zustand 等大型状态库。

## 1. 概述
- **React 层**: Context API（`NavigationContext`、`SubscriptionContext`、`ThemeContext`）。
- **进程通信**: Tauri Event（`engine-state`、`tauri-log`）。
- **持久化**: `settings.json` + `data.db`。
- **连接配置**: 内存 cacheKey（`merge-cache.ts`）+ 磁盘 `config.json`。

## 2. NavigationContext
- `activeTab`: `'home'` | `'subscription'` | `'settings'`。
- 无 react-router，减少打包体积。

## 3. SubscriptionContext
- **状态**: `subscriptions`、`activeIdentifier`、`activeConfig`、`nodes`、`loading`。
- **行为**:
  - `parseNodes()`: 过滤非真实节点 outbound。
  - `selectSubscription()`: 切换订阅（引擎忙碌时守卫拦截）。
  - 首次加载/切换完成后触发 `scheduleConfigSync`。
- **定时更新**: 按各订阅策略轮询；运行中更新后 `hotReloadIfRunning`。

## 4. ThemeContext
- `system` | `light` | `dark`，持久化于 `localStorage`。

## 5. 引擎状态 (useEngineState)
- 订阅 `engine-state` 事件。
- 类型: `idle` | `starting` | `running` | `stopping` | `failed`。
- 动作: `start`、`stop`、`clearError`。

## 6. 连接配置状态 (`merge-cache` + `config-sync`)

配置「新鲜度」不由 React state 持有，而由合并缓存键判断：

```
输入变化 → invalidateConnectionConfigCache()
         → onConnectionConfigStale → scheduleConfigSync (200ms 防抖)
         → mergeConnectionConfig → 写入 config.json → setLastMergeCacheKey

点击连接 → ensureConnectionConfigReady（cacheKey 匹配则跳过 merge）
```

Store 中与网络相关的 setter（端口、TUN 栈、DNS、Bypass 等）均会失效缓存，确保 `config.json` 与 UI 设置一致。

## 7. 配置存储 (`single/store.ts`)
- `LazyStore('settings.json')`，30+ Getter/Setter。
- `TunStack`: `'system' | 'gvisor' | 'mixed'`，键名 `tun_stack_key`。
- `getEnableTun()` / 路由模式等影响 merge profile 的项。

## 8. 数据库层 (`single/db.ts`)
- SQLite：`subscriptions`、`subscription_configs`，级联删除。

## 9. 引擎状态守卫
- `engine-guard.ts`、`require-engine-idle.ts`。
- 切换订阅、改端口等操作前检查 `isEngineBusy()`。
