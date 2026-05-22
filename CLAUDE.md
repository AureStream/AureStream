# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在本仓库中工作时提供指导。

## 项目概述

AureStream 是一个基于 **Mihomo** 内核的跨平台桌面代理客户端。技术栈：Tauri 2.0（Rust 后端）+ React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui（Radix）。UI 采用玻璃拟物设计语言，支持浅色/深色主题。

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式
npm run dev              # 仅前端开发服务器 (http://localhost:5173)
npm run dev:desktop      # 完整 Tauri 桌面应用（热重载）

# 构建与测试
npm run build           # 生产构建（typecheck + Vite 构建）
npm run typecheck       # 前端 TypeScript 类型检查
npm run typecheck:node  # Node 文件 TypeScript 类型检查

# Tauri 操作
npm run tauri           # 向 Tauri CLI 传递命令
npm run tauri:build     # 构建桌面安装包

# 开发工具
npm run preview         # 本地预览构建产物
```

## 架构概览

### 系统架构

```
┌─────────────────────────────────────────┐
│          前端层 (React 19)               │
│ 页面 → 组件 → 状态管理 (Zustand)         │
│ Tailwind CSS v4 + shadcn/ui             │
├─────────────────────────────────────────┤
│            Tauri IPC 桥接                │
│         （类型安全的 Rust 绑定）          │
├─────────────────────────────────────────┤
│         后端层 (Tauri 2.0/Rust)          │
│ SQLite 数据库 • 代理控制 • 配置管理      │
├─────────────────────────────────────────┤
│          Mihomo 内核 (Go)                │
└─────────────────────────────────────────┘
```

### 前端结构 (`src/`)

**核心组件：**

- **页面**：`Dashboard.tsx`（主页）、`Providers.tsx`、`Settings.tsx`
- **布局**：`Sidebar` 导航栏 + `MainContent` 页面容器（**桌面端壳层唯一**；移动端计划独立工程实现，见 `docs/MOBILE_UI.md`）
- **仪表盘**：黄金比例布局（61.8%/38.2%），单视口，玻璃拟物设计
- **状态管理**：
  - `useAppStore`：主题管理（浅色/深色）及持久化
  - `useProxyStore`：服务商、节点、连接状态、速率、延迟及持久化
- **API 桥接**：`src/lib/api.ts` 封装所有 Tauri `invoke()` 调用并提供 TypeScript 类型

**主要功能：**

- 通过 `currentPage` 状态手动路由（无 React Router）
- Mihomo 集成的实时代理连接控制
- 订阅管理与自动更新
- 延迟测试与节点选择
- 玻璃拟物 UI 与自定义 Tailwind 工具类

**设计系统：**

- 自定义玻璃工具类：`glass`、`glass-strong`、`glass-rail`
- CSS 自定义属性颜色系统，支持深色主题变体
- 主题切换与状态变化的平滑过渡

### 后端结构 (`src-tauri/`)

**入口文件：**

- `src-tauri/src/main.rs`：应用入口
- `src-tauri/src/lib.rs`：核心应用逻辑与 Tauri 初始化

**数据库层：**

- `src-tauri/src/db.rs`：SQLite 数据库初始化与 schema
- 持久化存储服务商、节点和配置

**命令系统：**
所有 Tauri 命令定义在 `src-tauri/src/commands/` 中：

- `proxy.rs`：代理控制、状态、配置
- `provider.rs`：服务商/订阅管理
- `subscription.rs`：下载和管理订阅文件
- `mihomo_kernel.rs`：Mihomo sidecar 进程管理
- `system_proxy.rs`：系统代理配置
- `builtin_config.rs`：生成 Mihomo 配置文件

**状态管理：**

- `ProxyState`：Mutex 保护的代理配置和状态
- `MihomoKernelState`：Mihomo sidecar 进程状态
- 基于数据库的持久化存储

### 数据模型

**前端类型 (`src/types/index.ts`)：**

```typescript
interface Provider {
  id: string;
  name: string;
  url: string;
  lastUpdated: string;
  nodeCount: number;
  trafficTotalGB?: number;  // 总流量（GB）
  trafficUsedGB?: number;   // 已用流量（GB）
  expiresAt?: string;       // ISO 8601 到期时间
  autoUpdateInterval?: number; // 自动更新间隔（分钟）
}

interface Node {
  id: string;
  name: string;
  providerId: string;
  type: string;    // vmess、vless、trojan 等
  server: string;
  port: number;
  delay?: number;  // 延迟（毫秒）
  enabled: boolean;
}
```

**后端模型 (`src-tauri/src/commands/mod.rs`)：**
与 TypeScript 并行的定义，采用 camelCase 命名约定用于 JSON 序列化。

### 开发规范

**代码组织：**

- 所有 UI 文本使用中文（zh-CN）
- 组合优于继承
- 前后端边界强制类型安全
- 统一的结构化错误处理

**开发流程：**

1. 运行 `npm run dev:desktop` 进行完整 Tauri 集成开发
2. 前后端变更均支持热重载
3. 应用初始化时自动应用 SQLite schema（无旧版安装路径的向后兼容迁移）

**测试策略：**

- 尚未配置正式测试框架
- 建议手动测试核心流程
- 文档中的 TODO 标记了需要自动化测试的区域

## 关键配置文件

**构建配置：**

- `vite.config.ts`：前端构建与开发服务器配置
- `src-tauri/Cargo.toml`：Rust 依赖与构建设置
- `src-tauri/tauri.conf.json`：Tauri 应用元数据与构建选项

**TypeScript 配置：**

- `@/` 别名解析为 `./src/`（在 vite.config.ts 和 tsconfig.json 中配置）
- 启用严格类型检查
- 路径映射实现跨代码库的清晰导入

## 环境变量

**开发环境：**

- `TAURI_DEV_HOST`：覆盖默认 localhost 用于远程调试
- 数据库路径按操作系统配置（Windows/macOS/Linux）

**生产环境：**

- Mihomo 二进制文件随应用打包（`binaries/mihomo`）
- 配置存储在操作系统特定的应用数据目录

## 常见任务

**添加新功能：**

1. 在 `src/types/index.ts` 中定义 TypeScript 接口
2. 在相应的 `src-tauri/src/commands/*.rs` 文件中添加 Tauri 命令
3. 在 `src/lib/api.ts` 中创建 API 封装函数
4. 更新 Zustand store 的状态和操作
5. 使用 shadcn/ui 基础组件构建 React 组件

**数据库操作：**

- schema 变更应向后兼容
- 新表请使用 `db.rs` 中的现有模式
- 所有数据访问通过 Tauri 命令进行

**UI 开发：**

- 使用 `cn()` 工具函数进行条件类名拼接
- 遵循 `src/index.css` 中的玻璃拟物设计系统
- 善用现有 shadcn/ui 组件
- 仪表盘保持黄金比例布局

## 故障排除

**常见问题：**

- Mihomo 进程无法启动 / `binaries/mihomo-*` 不存在：在项目根目录执行 `npm run mihomo:download`，确认生成 `src-tauri/binaries/mihomo-<target>`（勿从 `scripts/` 目录单独运行下载脚本）；桌面开发请用 `npm run dev:desktop`（会先确保二进制存在）。
- 连接失败：检查 NO_PROXY 环境变量是否包含 localhost
- 端口冲突：使用 `npm run dev:desktop` 并通过 `TAURI_DEV_HOST` 覆盖
- 主题未切换：清除浏览器缓存或检查 CSS 自定义属性回退值

**调试模式：**

- 在 Mihomo 内核配置中启用详细日志
- 查看 Tauri 开发者工具控制台输出
- 监控 SQLite 数据库内容以排查数据完整性问题

## 后续改进

追踪于 `docs/README.md`（章节「后续改进」）。

## 文档参考

- `README.md`：用户功能概览与快速开始
