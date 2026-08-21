# AureStream Wiki

AureStream 当前主线为 **v2**：Tauri v2 + React + **Xray-core** 侧车。

实现与约定以代码及 [`AGENTS.md`](../AGENTS.md) 为准。

## 权威入口

| 文档 | 说明 |
|---|---|
| [AGENTS.md](../AGENTS.md) | Agent / 开发者仓库约定（以代码为准） |
| [README.md](../README.md) | 项目简介与快速上手 |
| [架构设计](./architecture.md) | v2 分层、内核抽象、运行时流程、权限边界与故障恢复 |
| [系统代理与 TUN：捕获与 DNS](./capture-modes.md) | 两种捕获模式的流量路径、Xray DNS 分流、三端系统 DNS |
| [三端虚拟网卡（TUN）实现计划](./superpowers/plans/2026-08-05-aurestream-v2-tun-three-platforms.md) | Win/macOS/Linux TUN 的设计背景与实施记录 |

## 技术栈概览（v2）

| 层级 | 技术 | 角色 |
|---|---|---|
| 前端 UI | React 19, TypeScript, Vite 7, Tailwind CSS v4 | 鉴权门闸 + 首页/节点/我的 |
| 应用壳 | Tauri v2 | IPC、窗口、托盘、日志、`AppState` |
| API | `aurestream-api-client` | Worker 鉴权与订阅 |
| 解码 | `aurestream-config` | 订阅 URI → `ProxyNode`（不写内核 JSON） |
| 引擎 | `aurestream-engine` + Xray-core (`aurestream-core`) | 对象安全 `Engine`、配置构建、状态机、进程监管 |
| 系统代理 | `aurestream-platform-proxy` | set / clear |
| 虚拟网卡 | `aurestream-platform-tun` | Win/macOS/Linux 特权 Helper、TUN 与 DNS 恢复 |

## 项目目录结构概览（v2）

```text
AureStream/
├── docs/                      # Wiki + plans
├── src/                       # v2 React UI
├── src-tauri/                 # v2 Tauri shell（externalBin: aurestream-core）
├── crates/
│   ├── aurestream-api-client/
│   ├── aurestream-config/
│   ├── aurestream-engine/
│   ├── aurestream-platform-proxy/
│   └── aurestream-platform-tun/
└── scripts/
    ├── download-binaries.ts   # 拉 Xray 侧车
    ├── ldd-static-safe.sh     # Linux CI
    └── updater.js             # 更新清单生成
```

## 关键信息

- **内核**: Xray-core（侧车名 `aurestream-core`）
- **包管理器**: pnpm
- **默认代理模式**: 系统代理
- **可选代理模式**: TUN（需要对应平台的已安装 Helper / Service）
- **版本更新**: 启动时经 jsDelivr 检查签名更新清单；发现新版本后强制完成更新才能进入应用
- **默认发布脚本**: `pnpm release`（含 `download-binaries`；Windows TUN 和 macOS Helper 需额外预构建）
