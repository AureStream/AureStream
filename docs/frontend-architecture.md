# 前端架构

AureStream 前端采用 React 19 + TypeScript + Vite 7 构建，使用 shadcn/ui 和 Tailwind CSS v4 进行样式设计，提供现代化的系统代理客户端体验。

## 1. 前端概述
- **框架**: React 19 + TypeScript + Vite 7
- **样式**: shadcn/ui (new-york 风格) + Tailwind CSS v4
- **国际化**: i18next (默认中文，支持英文)
- **路径别名**: `@/*` 映射到 `./src/*`

## 2. 应用入口与启动流程

- `main.tsx`: 渲染 `App` 组件，包裹在 `ThemeProvider` 和 `TooltipProvider` 中。
- `index.html`: 内联启动屏（双环 SVG + Logo），在 WebView 加载完成前展示。
- `App.tsx`:
  - 顶层 `AppBootstrap`：等待 `SubscriptionContext` 首次加载完成后淡出启动屏（最短可见 650ms）。
  - 侧效导入 `@/lib/config-sync`：注册配置预合并监听器。
  - `NavigationProvider` → `SubscriptionProvider` → `AppLayout`。
- **无 react-router**: 通过 `NavigationContext` 进行标签页式导航（`home` | `subscription` | `settings`）。

### 启动相关模块

| 模块 | 职责 |
|------|------|
| `lib/boot-splash.ts` | 控制 HTML 启动屏淡出 |
| `components/layout/LoadingScreen.tsx` | 应用内加载占位（面板/全屏变体） |
| `components/layout/CircularLoader.tsx` | 双环旋转加载动画 |
| `lib/app-paths.ts` | 通过 Tauri 命令解析 `config.json`、配置目录等路径 |
| `lib/settings-load.ts` | 设置页批量并行加载 store 项 |

## 3. 页面组件

### HomePage.tsx - 仪表盘
- 采用双列网格布局（`lg` 断点以上左右分栏）。
- **左侧**: `ConnectionPanel` + `NodeSelector`（`min-w-0` 防止网格溢出裁切）。
- **右侧**: `SubscriptionPanel` + `NetworkPanel` + `UsagePanel`（懒加载）。

### SubscriptionPage.tsx - 订阅管理
- 订阅列表、添加表单、自动更新间隔（30m ~ 7d）。
- 更新后若引擎运行中，通过 `hotReloadIfRunning` 热重载配置。

### SettingsPage.tsx - 设置
- 外观与主题、关于与更新检查。
- 系统与服务：开机自启、TUN 服务安装/卸载。
- 网络与代理：TUN 栈（system/gvisor/mixed）、端口、Bypass 列表；变更后 `syncActiveConnectionConfig`。

## 4. 核心组件

- **ConnectionPanel.tsx**: 电源按钮、运行时间、路由模式（规则/全局）、接管模式（系统代理/TUN）、统一 `connectEngine` 连接入口。
- **NodeSelector.tsx**: 节点网格（容器查询双列）、离线国旗 `CountryFlag`、并发测速、排序工具栏；未连接时切换节点触发 config-sync。
- **NetworkPanel.tsx**: GeoIP 信息，连接/切节点后刷新。
- **SubscriptionPanel.tsx**: 当前订阅摘要与流量进度。
- **UsagePanel.tsx**: Recharts 实时流量图，数据来自 `/traffic` NDJSON 流。
- **CountryFlag** (`components/ui/country-flag.tsx`): 基于 `country-flag-icons` 离线 SVG，未知地区使用 `unknown-flag.tsx`。

## 5. 连接与配置模块 (`src/lib/`)

| 模块 | 职责 |
|------|------|
| `config-sync.ts` | 输入变化时防抖预合并；`ensureConnectionConfigReady` 供连接前校验 |
| `connection-config.ts` | 按路由/TUN 解析 merge profile，带 cacheKey 跳过重复写入 |
| `connection-flow.ts` | `connectEngine` 统一连接流程与 perf 埋点 |
| `hot-reload-config.ts` | 运行中 force merge + `reload_config` |
| `merge-cache.ts` | 上次合并 cacheKey 与 stale 事件总线 |
| `engine-probe.ts` | 缓存引擎探测结果，减少设置页重复 IPC |
| `perf.ts` | 前端耗时统计（`connect.*`、`hot-reload.*`、`config-sync.*`） |
| `routing-mode.ts` | `rule` / `global` 模式 |
| `proxy-bypass.ts` | 平台感知 Bypass 列表 |
| `engine-guard.ts` | `isEngineBusy()` / `isEngineIdle()` |
| `require-engine-idle.ts` | 引擎忙碌拦截弹窗 |
| `country-flags.ts` | 节点名 → ISO 国家代码映射 |
| `typography.ts` | 设计系统排版与工具栏按钮样式（`btn.toolbar*`） |
| `i18n.ts` | i18next 配置 |

## 6. sing-box API 客户端 (`src/utils/singbox-api/`)

- `client.ts`: 基础 fetch 封装。
- `controller-cache.ts`: 控制器地址/secret 内存缓存，热重载后失效。
- `traffic.ts`: NDJSON 流量流解析。
- 节点切换、延迟测试、selector 组查询均直连 Clash API，绕过 Tauri IPC。

## 7. 数据层 (`src/action/`, `src/single/`)

- `action/db.ts`: 订阅 CRUD；`fetchConfigContent()` 支持 `file://` 与远程 URL。
- `single/db.ts`: 惰性 SQLite 连接。
- `single/store.ts`: `settings.json` 读写；网络相关 setter 会 `invalidateConnectionConfigCache()`。

## 8. 类型定义 (`src/types/`)

- `definition.ts`: Store 键名、订阅模型、`TUN_STACK_STORE_KEY` 等。
- `engine-state.ts`: `idle` | `starting` | `running` | `stopping` | `failed`。
- `singbox.ts`: Clash API 请求/响应类型。
