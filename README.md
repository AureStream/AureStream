# AureStream

AureStream 是一款跨平台代理客户端。当前主线为 **v2 MVP**：基于 [Tauri v2](https://tauri.app/) + React，内核使用 [Xray-core](https://github.com/XTLS/Xray-core) 侧车（打包为 `aurestream-core`），**仅系统代理模式**（不做 TUN）。

## 核心特性（MVP）

- **Xray-core 引擎**：订阅解码为引擎无关节点模型，由引擎生成 Xray 配置并启动侧车
- **系统代理**：连接时设置、断开/失败时清除
- **账号与订阅**：登录 / 邮箱验证码注册，拉取订阅并选择节点
- **事件驱动 UI**：首页不被长时间订阅同步门闸阻塞
- **跨平台**：Windows / macOS / Linux

## 仓库布局

| 路径 | 说明 |
|---|---|
| `src/` + `src-tauri/` | v2 应用（当前维护） |
| `crates/aurestream-*` | API / config / engine / platform-proxy |
| `legacy/` | pre-v2 旧树，**已归档，不维护功能** |
| `docs/superpowers/specs/` | v2 边界设计规格 |

设计规格：[docs/superpowers/specs/2026-08-05-aurestream-v2-boundaries-design.md](./docs/superpowers/specs/2026-08-05-aurestream-v2-boundaries-design.md)

## 快速上手（开发）

```bash
pnpm install
pnpm download-binaries   # 下载 Xray → src-tauri/binaries/aurestream-core-*
pnpm tauri dev
```

发布流水线（无 TUN）：

```bash
pnpm release
```

## 文档

- Agent 约定：[`AGENTS.md`](./AGENTS.md)
- Wiki 索引：[`docs/index.md`](./docs/index.md)（部分旧页仍描述 pre-v2 / sing-box，以代码与 v2 规格为准）
