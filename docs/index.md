# AureStream Wiki

AureStream 是一款基于 Tauri v2 + React + sing-box 的跨平台代理/VPN 客户端。本 Wiki 提供项目技术文档，供开发与测试参考。

## 技术栈概览

| 层级 | 技术 | 角色 |
|---|---|---|
| 前端 UI | React 19, TypeScript, Vite 7, Tailwind CSS v4, shadcn/ui | 界面、配置预合并、Clash API |
| 应用壳 | Tauri v2 + 插件 (Shell, OS, Store, SQL, Process 等) | FFI 桥接与系统权限 |
| 后端核心 | Rust (Tauri Commands, Tokio async) | 状态机、进程监控、端口管理 |
| 系统代理 | aurestream-plugin-proxy | WinINet / SystemConfiguration / gsettings |
| TUN 助手 | tun-service (Windows) / XPC Helper (macOS) / pkexec helper (Linux) | 虚拟网卡与特权操作 |
| 核心引擎 | sing-box v1.13.13 (sidecar) | 路由与代理协议 |

## 文档导航

1. [项目介绍](./introduction.md)
2. [系统架构](./architecture.md)
3. [前端架构](./frontend-architecture.md)
4. [后端架构](./backend-architecture.md)
5. [状态管理](./state-management.md)
6. [配置合并与模板](./wiki-config-merger.md)
7. [UI 设计系统](./ui-design-system.md)
8. [API 参考](./api-reference.md)
9. [构建与部署](./build-and-deploy.md)
10. [故障排查](./troubleshooting.md)

### 规划与设计

- [排版与色彩](./design/typography-and-colors.md)
- [计划文档](./plan/)（架构修复、多订阅状态、与 OneBox 差距分析等）

## 项目目录结构概览

```text
AureStream/
├── docs/                    # Wiki 文档
├── src/                     # 前端 (React/TypeScript)
│   ├── lib/                 # config-sync、connection-flow、perf 等
│   ├── config/merger/       # sing-box 配置合并
│   └── components/          # UI 组件
├── src-tauri/               # Rust 后端
│   ├── src/core/            # Tauri command 入口
│   ├── src/engine/          # 引擎编排、状态机、平台实现
│   ├── resources/linux/     # Linux deb/rpm 安装/卸载脚本
├── crates/                  # Rust workspace crates
│   ├── aurestream-plugin-proxy/
│   ├── aurestream-plugin-tun/
│   └── aurestream-plugin-privilege/
├── scripts/                 # 二进制下载、签名、预构建
└── tauri.conf.json          # Tauri 主配置
```

## 关键信息

- **版本**: v0.2.4
- **内核**: sing-box v1.13.13
- **包管理器**: pnpm 11.4.0
- **默认端口**: 代理 2345，控制 API 9191
- **配置策略**: 输入变化时预合并 `config.json`，连接时校验缓存

## 近期架构要点（v0.2.4）

- **config-sync**：订阅/设置/节点变更触发防抖合并，连接不再阻塞于 merge。
- **hot-reload**：运行中变更配置可 `reload_config` 不断连。
- **停止优化**：`wait_for_port_release` 替代固定 sleep。
- **启动体验**：HTML 启动屏 + 订阅加载完成后淡出。
- **国旗离线化**：`country-flag-icons` 打包，无 Emoji 依赖。
- **后端结构**：引擎编排收敛到 `src-tauri/src/engine`，系统代理/TUN/提权逻辑拆分到 workspace crates。
