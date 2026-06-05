# AureStream Wiki

AureStream 是一款基于 Tauri v2 + React + sing-box 的跨平台代理/VPN 客户端。本 Wiki 提供了项目的全面技术文档，供开发者参考。

## 技术栈概览

| 层级 | 技术 | 角色 |
|---|---|---|
| 前端 UI | React 19, TypeScript, Vite 7, Tailwind CSS v4, shadcn/ui | 界面与状态管理 |
| 应用壳 | Tauri v2 + 15个插件 (Shell, OS, Store, SQL, Process等) | FFI桥接与系统权限 |
| 后端核心 | Rust (Tauri Commands, Tokio async) | 状态机、进程监控、异步DNS探测 |
| 系统代理 | sysproxy_rs (WinINet/SystemConfiguration/gsettings) | 动态系统代理控制 |
| TUN助手 | tun-service (Windows SCM) | TAP/TUN虚拟网卡与路由 |
| 核心引擎 | sing-box v1.13.13 (Tauri sidecar) | VPN路由与协议引擎 |

## 文档导航

1. 📖 [项目介绍](file:///d:/wry/Projects/AureStream/docs/introduction.md)
2. 🏗️ [系统架构](file:///d:/wry/Projects/AureStream/docs/architecture.md)
3. 🖥️ [前端架构](file:///d:/wry/Projects/AureStream/docs/frontend-architecture.md)
4. ⚙️ [后端架构](file:///d:/wry/Projects/AureStream/docs/backend-architecture.md)
5. 🔄 [状态管理](file:///d:/wry/Projects/AureStream/docs/state-management.md)
6. 📦 [配置合并与模板](file:///d:/wry/Projects/AureStream/docs/wiki-config-merger.md)
7. 🎨 [UI设计系统](file:///d:/wry/Projects/AureStream/docs/ui-design-system.md)
8. 📡 [API参考](file:///d:/wry/Projects/AureStream/docs/api-reference.md)
9. 🔨 [构建与部署](file:///d:/wry/Projects/AureStream/docs/build-and-deploy.md)
10. 🐛 [故障排查](file:///d:/wry/Projects/AureStream/docs/troubleshooting.md)

## 项目目录结构概览

```text
AureStream/
├── docs/               # Wiki 文档
├── src/                # 前端代码 (React/TypeScript)
├── src-tauri/          # 后端代码 (Rust/Tauri)
│   ├── src/            # Tauri 核心代码
│   ├── sysproxy-rs/    # 系统代理工具库
│   └── tun-service/    # Windows TUN 虚拟网卡服务
├── package.json        # 前端依赖与脚本
└── tauri.conf.json     # Tauri 配置文件
```

## 关键信息

- **版本**: v0.2.3
- **内核**: sing-box v1.13.13
- **包管理器**: pnpm 11.4.0
