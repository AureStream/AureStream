# 前端架构

AureStream 前端采用 React 19 + TypeScript + Vite 7 构建，使用 shadcn/ui 和 Tailwind CSS v4 进行样式设计，提供现代化的系统代理客户端体验。

## 1. 前端概述
- **框架**: React 19 + TypeScript + Vite 7
- **样式**: shadcn/ui (new-york 风格) + Tailwind CSS v4
- **国际化**: i18next (默认中文，支持英文)
- **路径别名**: `@/*` 映射到 `./src/*`

## 2. 应用入口与路由
- `main.tsx`: 渲染 `App` 组件，包裹在 `ThemeProvider` 和 `TooltipProvider` 中，使用 `React.StrictMode`。
- `App.tsx`: 包含状态提供者层级 `NavigationProvider` → `SubscriptionProvider` → `AppLayout`。
- `AppLayout` 渲染 `AppSidebar` 并根据 `activeTab` (home | subscription | settings) 渲染相应的页面。
- **无 react-router**: 通过简单的 `NavigationContext` 状态进行标签页式导航。

## 3. 页面组件

### HomePage.tsx - 仪表盘
- 采用双列网格布局。
- **左侧**: `ConnectionPanel` (控制连接状态) + `NodeSelector` (节点选择，高度自适应)。
- **右侧**: `SubscriptionPanel` (当前订阅信息) + `NetworkPanel` (网络状态与 GeoIP) + `UsagePanel` (流量监控图表)。

### SubscriptionPage.tsx - 订阅管理
- **左侧面板**: 订阅列表，显示流量进度条、状态徽章，支持更新/删除操作。
- **右侧面板**: 添加订阅表单。
- **自动更新**: 支持 30m, 1h, 2h, 3h, 6h, 12h, 24h, 7d 更新间隔。
- **热重载**: 更新后如果引擎在运行状态，会自动重新构建 `config.json` 并调用 `reload_config`。

### SettingsPage.tsx - 设置
- **外观与主题**: 系统/浅色/深色主题切换。
- **关于**: 版本信息，更新检查器。
- **系统与服务**: 开机自启，TUN 服务管理。
- **网络与代理**: TUN 栈配置，端口设置，系统代理绕过列表 (Bypass List)。

## 4. 核心组件

- **ConnectionPanel.tsx**: 电源按钮（带动画状态），运行时间计时器，路由模式切换（规则/全局），接管模式切换（系统代理/TUN 模式），TUN 服务安装提示。
- **NodeSelector.tsx**: 代理节点网格列表，显示国家/地区国旗图标（通过 `country-flags.ts` 映射）。支持并发 TCP Ping 测速，支持按默认/延迟/名称排序。通过 `clash_api` 进行实时节点切换。每个订阅记录独立的上次选择节点。
- **NetworkPanel.tsx**: 显示 GeoIP 信息（国家、IP、地区、ISP），在连接或切换节点时自动刷新。
- **SubscriptionPanel.tsx**: 活动订阅摘要卡片，带流量使用进度条。
- **UsagePanel.tsx**: 实时上传/下载速度统计及总流量。通过 Recharts 绘制面积图（60个数据点的滑动窗口），数据通过 sing-box 的 `/traffic` 端点流式获取。
- **AppSidebar.tsx**: 包含 3 个页面的导航图标，主题切换按钮，以及带脉冲动画的更新提示器。

## 5. 工具库 (src/lib/)
- `connection-config.ts`: 根据路由模式和 TUN 开关派发相应的配置合并器。
- `country-flags.ts`: 节点名称到国家/地区代码的映射，包含预设别名。
- `engine-guard.ts`: 提供 `isEngineBusy()` 和 `isEngineIdle()` 状态判断。
- `routing-mode.ts`: 'rule' 与 'global' 模式定义及切换逻辑。
- `proxy-bypass.ts`: 平台感知的 Bypass 列表管理。
- `require-engine-idle.ts`: 引擎忙碌时的拦截弹窗控制。
- `i18n.ts`: i18next 配置。
- `typography.ts`: 设计系统 Typography 定义。
- `utils.ts`: 导出 `cn()` 帮助函数 (clsx + tailwind-merge)。

## 6. 数据层 (src/action/, src/single/)
- `action/db.ts`: 订阅 CRUD 操作，`fetchConfigContent()` 支持读取本地 `file://` 和远程 URL 配置。
- `single/db.ts`: 惰性 SQLite 连接 (`tauri-plugin-sql`)。
- `single/store.ts`: 基于 `tauri-plugin-store` 的 `settings.json` 管理，包含 30+ 配置项。

## 7. 类型定义 (src/types/)
- `definition.ts`: 核心类型定义，Store 键名常量，订阅模型接口。
- `engine-state.ts`: 引擎状态联合类型 (`idle` | `starting` | `running` | `stopping` | `failed`)。
- `singbox.ts`: sing-box Clash API 的请求/响应数据结构定义。
