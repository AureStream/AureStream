# AureStream

完整文档目录与后续改进见 [README.md](README.md)。

## 技术栈

- **桌面框架**: Tauri 2.0
- **前端**: React 19 + TypeScript + Vite 7
- **UI**: Tailwind CSS v4 + shadcn/ui (Radix primitives)
- **状态管理**: Zustand 5
- **代理内核**: mihomo (MetaCubeX)

## 项目结构

```
src/
├── components/
│   ├── dashboard/          # 仪表盘组件
│   │   ├── ConnectButton.tsx
│   │   ├── LeftOperationPanel.tsx
│   │   ├── SubscriptionBlock.tsx
│   │   ├── NetworkBlock.tsx
│   │   ├── UsageBlock.tsx
│   │   ├── NodePickerDialog.tsx
│   │   └── TrafficUsageRing.tsx
│   ├── provider/           # 服务商管理
│   │   ├── ProviderCard.tsx
│   │   └── ProviderModal.tsx
│   ├── layout/             # 布局组件
│   │   └── PageShell.tsx
│   └── ui/                 # shadcn 基础组件
├── pages/
│   ├── Dashboard.tsx       # 仪表盘首页
│   ├── Providers.tsx       # 服务商管理
│   └── Settings.tsx        # 设置
├── stores/
│   └── appStore.ts         # Zustand 全局状态
├── types/
│   └── index.ts            # TypeScript 类型定义
└── lib/
    └── utils.ts            # 工具函数
```

## 页面设计

### 仪表盘 (Dashboard)

黄金比例双栏布局 `grid-cols-[61.8%_38.2%]`，单视口无滚动。

**左栏 (61.8%)** — 操作区，内容随连接状态变化：

| 未连接                        | 已连接                     |
| ----------------------------- | -------------------------- |
| 空白占位                      | 连接时长 (HH:MM:SS)        |
| ConnectButton (呼吸动画)      | ConnectButton (活跃动画)   |
| 空白占位                      | 实时速率胶囊 (↓上传 ↑下载) |
| 代理模式选择 (规则/全局/直连) | 节点信息胶囊               |

**右栏 (38.2%)** — 信息展示区，始终可见：

- **订阅信息**: 服务商名称、流量详情、环形进度图、到期时间
- **网络信息**: IP、国家、城市、ASN、组织
- **用量信息**: 上传/下载/总计 + SVG 波浪面积图

### 服务商管理 (Providers)

卡片网格布局，支持：

- 添加/编辑/删除服务商
- 启用/禁用订阅
- 设为当前订阅
- 更新订阅

## 设计系统

### 视觉风格

Glassmorphism — 毛玻璃质感，支持明暗双主题。

### 颜色

| 用途     | 浅色                     | 深色                  |
| -------- | ------------------------ | --------------------- |
| 主色     | `#3b82f6`                | `#60a5fa`             |
| 背景     | `#f4f7fc`                | `#0c1222`             |
| 卡片     | `rgba(255,255,255,0.75)` | `rgba(15,23,42,0.76)` |
| 文字     | `#0f172a`                | `#e2e8f0`             |
| 次要文字 | `#64748b`                | `#94a3b8`             |

### 动画

- 连接按钮呼吸动画: idle 4s / active 2s
- 状态切换: 700ms ease-in-out
- 内容进出: fade-in-down / fade-in-up 0.7s

## 开发

```bash
npm install          # 安装依赖
npm run dev          # 前端开发服务器
npm run dev:desktop  # Tauri 桌面开发
npm run build        # 生产构建
```
