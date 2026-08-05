# AureStream Wiki

AureStream 当前主线为 **v2 MVP**：Tauri v2 + React + **Xray-core** 侧车，**仅系统代理**（无 TUN）。

> **注意**：下列部分专题页仍可能描述 pre-v2（sing-box / TUN / config-merger）行为。实现与边界以代码及 v2 规格为准；旧应用在 `legacy/`，已归档不维护。

## v2 权威文档

| 文档 | 说明 |
|---|---|
| [v2 边界设计规格](./superpowers/specs/2026-08-05-aurestream-v2-boundaries-design.md) | 布局、crate 边界、启停流、UI IA |
| [v2 MVP 实施计划](./superpowers/plans/2026-08-05-aurestream-v2-mvp.md) | 任务拆分与验收 |
| [AGENTS.md](../AGENTS.md) | Agent / 开发者仓库约定 |

## 技术栈概览（v2 MVP）

| 层级 | 技术 | 角色 |
|---|---|---|
| 前端 UI | React 19, TypeScript, Vite 7, Tailwind CSS v4 | 鉴权门闸 + 首页/节点/我的 |
| 应用壳 | Tauri v2 | IPC、窗口、`AppState` |
| API | `aurestream-api-client` | Worker 鉴权与订阅 |
| 解码 | `aurestream-config` | 订阅 URI → `ProxyNode`（不写内核 JSON） |
| 引擎 | `aurestream-engine` + Xray-core (`aurestream-core`) | `build_config`、状态机、侧车 |
| 系统代理 | `aurestream-platform-proxy` | set / clear |

## 文档导航（历史专题）

以下页面可能滞后于 v2；查阅时请对照规格与源码。

1. [项目介绍](./introduction.md)
2. [系统架构](./architecture.md)
3. [前端架构](./frontend-architecture.md)
4. [后端架构](./backend-architecture.md)
5. [状态管理](./state-management.md)
6. [配置合并与模板](./wiki-config-merger.md)（pre-v2；v2 方言在引擎内）
7. [UI 设计系统](./ui-design-system.md)
8. [API 参考](./api-reference.md)
9. [构建与部署](./build-and-deploy.md)
10. [故障排查](./troubleshooting.md)

### 规划与设计

- [排版与色彩](./design/typography-and-colors.md)
- [计划文档](./plan/)
- [Superpowers specs / plans](./superpowers/)

## 项目目录结构概览（v2）

```text
AureStream/
├── docs/                      # Wiki + superpowers specs/plans
├── src/                       # v2 React UI
├── src-tauri/                 # v2 Tauri shell（externalBin: aurestream-core）
├── crates/
│   ├── aurestream-api-client/
│   ├── aurestream-config/
│   ├── aurestream-engine/
│   └── aurestream-platform-proxy/
├── legacy/                    # 归档的 pre-v2 树（勿改功能）
└── scripts/download-binaries.ts
```

## 关键信息（MVP）

- **内核**: Xray-core（侧车名 `aurestream-core`）
- **包管理器**: pnpm
- **代理模式**: 系统代理 only
- **默认发布脚本**: `pnpm release`（含 `download-binaries`，**不含** `build-tun`）
