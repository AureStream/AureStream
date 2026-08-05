# AureStream

AureStream 是一款跨平台代理客户端。当前主线为 **v2**：基于 [Tauri v2](https://tauri.app/) + React，内核使用 [Xray-core](https://github.com/XTLS/Xray-core) 侧车（打包为 `aurestream-core`）。

**默认捕获方式为系统代理**；虚拟网卡（TUN）三端方案见规划文档，尚未合入默认发布路径。

## 核心特性

- **Xray-core 引擎**：订阅解码为引擎无关节点模型，由引擎生成 Xray 配置并启动侧车
- **系统代理**：连接时设置、断开/失败时清除（Windows / macOS / Linux）
- **账号与订阅**：登录 / 邮箱验证码注册，拉取订阅并选择节点
- **节点测速**：TCP 延迟探测、按延迟排序；首页展示当前节点延迟
- **系统托盘**：显示主界面、系统代理开关、退出（虚拟网卡菜单项预留）
- **事件驱动 UI**：首页不被长时间订阅同步门闸阻塞；错误以弹窗提示
- **统一日志**：应用日志与内核日志跨平台命名一致

## 仓库布局

| 路径 | 说明 |
|---|---|
| `src/` + `src-tauri/` | v2 应用（当前维护） |
| `crates/aurestream-*` | API / config / engine / platform-proxy |
| `legacy/` | pre-v2 旧树，**已归档，不维护功能** |
| `docs/` | Wiki 与规划文档 |

## 快速上手（开发）

```bash
pnpm install
pnpm download-binaries   # 下载 Xray → src-tauri/binaries/aurestream-core-*
pnpm tauri dev
```

发布流水线（默认无 TUN）：

```bash
pnpm release
```

## 文档

- Agent 约定：[`AGENTS.md`](./AGENTS.md)
- Wiki 索引：[`docs/index.md`](./docs/index.md)（部分旧页可能滞后，以代码为准）
- 三端虚拟网卡（TUN）规划：[`docs/superpowers/plans/2026-08-05-aurestream-v2-tun-three-platforms.md`](./docs/superpowers/plans/2026-08-05-aurestream-v2-tun-three-platforms.md)
