# AureStream 技术方案与功能设计

文档索引见 [README.md](README.md)。

**版本**: 2.0  
**日期**: 2026-05-14  
**项目**: AureStream — 基于 Mihomo 内核的跨平台代理软件  
**技术栈**: Tauri 2.0 + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui + Zustand 5

---

## 1. 项目概述

### 1.1 背景

AureStream 是一款基于 MetaCubeX/mihomo 内核的跨平台代理客户端，提供订阅管理、节点选择、延迟测试、流量监控等核心功能。设计参考 Surge/Nextin 等主流代理客户端，采用 PC 桌面黄金比例布局 + 移动端信息架构的跨平台中性设计语言。

### 1.2 核心功能

- 代理连接控制（规则/全局/直连三种模式）
- 服务商订阅管理（添加、编辑、删除、启用/禁用、更新）
- 节点选择与切换（延迟显示、一键测速）
- 实时流量统计与用量图表
- 网络信息展示（IP、地区、ASN）
- 浅色/深色主题切换
- Glassmorphism 设计风格

---

## 2. 技术架构

### 2.1 整体架构

```
┌─────────────────────────────────────────┐
│              前端层 (React 19)           │
│  Pages → Components → Stores (Zustand)  │
│  Tailwind CSS v4 + shadcn/ui            │
├─────────────────────────────────────────┤
│           Tauri IPC (invoke)             │
├─────────────────────────────────────────┤
│            Rust 后端 (Tauri 2.0)         │
│  代理控制 / 订阅管理 / 配置管理           │
├─────────────────────────────────────────┤
│            Mihomo 内核 (Go)              │
└─────────────────────────────────────────┘
```

### 2.2 技术选型

| 技术            | 用途     | 选择理由                                   |
| --------------- | -------- | ------------------------------------------ |
| Tauri 2.0       | 桌面框架 | 体积小(2-10MB)、内存低(30-50MB)、Rust 安全 |
| React 19        | UI 框架  | 组件化、生态丰富、TypeScript 支持          |
| Tailwind CSS v4 | 样式     | 原子化 CSS、主题系统、暗色模式             |
| shadcn/ui       | 组件库   | Radix 无障碍、代码可控、高度定制           |
| Zustand 5       | 状态管理 | 轻量、TypeScript 友好、persist 中间件      |

### 2.3 目录结构

```
src/
├── components/
│   ├── dashboard/           # 仪表盘组件
│   │   ├── ConnectButton.tsx
│   │   ├── LeftOperationPanel.tsx
│   │   ├── SubscriptionBlock.tsx
│   │   ├── NetworkBlock.tsx
│   │   ├── UsageBlock.tsx
│   │   ├── NodePickerDialog.tsx
│   │   └── TrafficUsageRing.tsx
│   ├── provider/            # 服务商管理
│   │   ├── ProviderCard.tsx
│   │   └── ProviderModal.tsx
│   ├── layout/              # 布局
│   │   └── PageShell.tsx
│   └── ui/                  # shadcn 基础组件
├── pages/
│   ├── Dashboard.tsx        # 首页仪表盘
│   ├── Providers.tsx        # 服务商管理
│   └── Settings.tsx         # 设置
├── stores/
│   └── appStore.ts          # Zustand 全局状态
├── types/
│   └── index.ts
└── lib/
    └── utils.ts
```

---

## 3. 页面设计

### 3.1 仪表盘 (Dashboard)

**布局**: 黄金比例双栏 `grid-cols-[61.8%_38.2%]`，单视口无滚动。

**左栏 (61.8%)** — 状态驱动操作区：

```
┌─────────────────────┐
│                     │
│     00:12:34        │  ← 连接时长 (仅已连接)
│                     │
│        ◉            │  ← ConnectButton (呼吸动画)
│    点击连接/已连接    │
│  规则模式已开启       │
│                     │
│  ↓ 1.2 MB/s ↑ 0.3  │  ← 实时速率胶囊 (仅已连接)
│                     │
│  ┌─────────────────┐│
│  │ 🇭🇰 香港·中环    ││  ← 节点信息胶囊 (已连接)
│  │ server:8080 HTTP ││
│  │          45ms  > ││
│  └─────────────────┘│
│                     │
│  [规则] [全局] [直连]│  ← 代理模式选择 (未连接)
│                     │
└─────────────────────┘
```

**右栏 (38.2%)** — 信息展示区：

```
┌─────────────────────┐
│ 📦 供应商订阅        │
│ 服务商名称           │
│ 总流量 · 已用 · 剩余 │
│ [═══════░░] 用量占比 │
│ 到期时间: xx/xx/xx   │
├─────────────────────┤
│ 🌐 网络信息          │
│ IP · 国家 · 城市     │
│ ASN · 组织           │
├─────────────────────┤
│ 📊 用量信息          │
│ 上传 · 下载 · 总计   │
│ ╱╲ 波浪面积图       │
│ 蓝色下载 · 绿色上传  │
└─────────────────────┘
```

**设计要点**:

- 所有区域固定高度，防止状态切换时布局抖动
- ConnectButton 同一 DOM 元素，仅 CSS 类动态切换
- 左栏内容使用 fade-in-down/up 动画过渡

### 3.2 服务商管理 (Providers)

```
┌──────────┐ ┌──────────┐ ┌──────────┐
│ 服务商 1  │ │ 服务商 2  │ │ 服务商 3  │
│ 节点: 25  │ │ 节点: 18  │ │ 节点: 30  │
│ 启用/禁用 │ │ 启用/禁用 │ │ 启用/禁用 │
│ 设为当前  │ │ 设为当前  │ │ 设为当前  │
│ ✏️ 🗑️ 🔄 │ │ ✏️ 🗑️ 🔄 │ │ ✏️ 🗑️ 🔄 │
└──────────┘ └──────────┘ └──────────┘
┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
│  ＋ 添加服务商              │
└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
```

- CRUD 操作：添加/编辑/删除/更新
- 启用/禁用状态切换
- 设为当前订阅
- 删除确认对话框

---

## 4. 数据结构

### 4.1 TypeScript 类型

```typescript
interface Provider {
  id: string;
  name: string;
  url: string;
  group?: string;
  enabled: boolean;
  lastUpdated: string;
  nodeCount: number;
  trafficTotalGB?: number;
  trafficUsedGB?: number;
  expiresAt?: string;
}

interface Node {
  id: string;
  name: string;
  providerId: string;
  type: string;
  server: string;
  port: number;
  delay?: number;
  enabled: boolean;
}
```

### 4.2 状态管理 (Zustand)

```typescript
interface ProxyStore {
  isConnected: boolean;
  isConnecting: boolean;
  currentProvider?: Provider;
  currentNode?: Node;
  providers: Provider[];
  nodes: Node[];
  uploadSpeed: number;
  downloadSpeed: number;

  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  addProvider: (p: Provider) => void;
  updateProvider: (id: string, u: Partial<Provider>) => void;
  deleteProvider: (id: string) => void;
  setCurrentProvider: (p?: Provider) => void;
  setCurrentNode: (n?: Node) => void;
  testLatency: () => Promise<void>;
}
```

---

## 5. 设计系统

### 5.1 视觉风格

**Glassmorphism** — 毛玻璃质感，`backdrop-filter: blur()` + 半透明背景 + 细边框。

### 5.2 颜色系统

| Token            | 浅色                     | 深色                    |
| ---------------- | ------------------------ | ----------------------- |
| primary          | `#3b82f6`                | `#60a5fa`               |
| background       | `#f4f7fc`                | `#0c1222`               |
| card             | `rgba(255,255,255,0.75)` | `rgba(15,23,42,0.76)`   |
| muted-foreground | `#64748b`                | `#94a3b8`               |
| border           | `rgba(59,130,246,0.2)`   | `rgba(96,165,250,0.14)` |
| destructive      | `#ef4444`                | `#991b1b`               |

### 5.3 动画规范

| 动画          | 时长  | 缓动        | 用途              |
| ------------- | ----- | ----------- | ----------------- |
| 呼吸 (idle)   | 4s    | ease-in-out | 未连接按钮光晕    |
| 呼吸 (active) | 2s    | ease-in-out | 已连接按钮光晕    |
| 状态过渡      | 700ms | ease-in-out | 按钮颜色/阴影切换 |
| 内容淡入      | 700ms | ease-out    | 面板内容进出      |

### 5.4 间距

采用 4px 基础单位：gap-1(4px) ~ gap-12(48px)，组件内边距 px-1~px-6。

---

## 6. 实现状态

| 功能                          | 状态 |
| ----------------------------- | ---- |
| 仪表盘黄金比例布局            | ✅   |
| ConnectButton 呼吸动画        | ✅   |
| 状态驱动左栏面板              | ✅   |
| 代理模式选择 (规则/全局/直连) | ✅   |
| 节点选择对话框                | ✅   |
| 订阅信息展示 + 环形图         | ✅   |
| 网络信息展示                  | ✅   |
| 用量图表 (SVG 波浪面积图)     | ✅   |
| 服务商 CRUD + 启用/禁用       | ✅   |
| 明暗主题切换                  | ✅   |
| Mihomo 内核集成               | ⏳   |
| 订阅拉取解析                  | ⏳   |
| 延迟测试 (TCP)                | ⏳   |
| Tauri IPC 命令                | ⏳   |

---

**文档结束**
