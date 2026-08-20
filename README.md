# AureStream

AureStream 是一款跨平台代理客户端。当前主线为 **v2**：基于 [Tauri v2](https://tauri.app/) + React，内核使用 [Xray-core](https://github.com/XTLS/Xray-core) 侧车（打包为 `aurestream-core`）。

**默认捕获方式为系统代理**；虚拟网卡（TUN）已实现 Windows / macOS / Linux 三端，作为需要安装平台特权 Helper 的可选模式（默认 `pnpm release` 产物不含 TUN，见下文与 AGENTS.md）。

## 核心特性

- **Xray-core 引擎**：订阅解码为引擎无关节点模型，由引擎生成 Xray 配置并启动侧车
- **系统代理**：连接时设置、断开/失败时清除（Windows / macOS / Linux）
- **虚拟网卡（TUN）**：Linux（systemd + polkit）、Windows（SCM service）、macOS（SMJobBless）三端特权 Helper，异常退出时尽力恢复 DNS
- **账号与订阅**：登录 / 邮箱验证码注册，拉取订阅并选择节点
- **节点测速**：TCP 延迟探测、按延迟排序；首页展示当前节点延迟
- **系统托盘**：显示主界面、系统代理 / TUN 开关（Helper 就绪后可用）、退出
- **事件驱动 UI**：首页不被长时间订阅同步门闸阻塞；错误以弹窗提示
- **实时流量与强制更新**：上报 Xray 用量，启动时校验签名更新清单，发现新版本需完成更新才能进入应用
- **统一日志**：应用日志与内核日志跨平台命名一致

## 仓库布局

| 路径 | 说明 |
|---|---|
| `src/` + `src-tauri/` | v2 应用（当前维护） |
| `crates/aurestream-*` | API / config / engine / platform-proxy / platform-tun |
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

TUN 需要额外为对应平台预构建特权组件（默认发布流程不含）：

```bash
pnpm build-tun                          # Windows：构建 tun-service.exe
pnpm pre-bundle                         # macOS：构建并签名 SMJobBless Helper
./scripts/install-linux-tun-helper.sh   # Linux 开发环境：安装 systemd + polkit Helper
```

Linux 生产环境通过 deb/rpm 安装 Helper 与 polkit 策略；详见 AGENTS.md。

## 文档

- Agent 约定：[`AGENTS.md`](./AGENTS.md)
- Wiki 索引：[`docs/index.md`](./docs/index.md)（部分旧页可能滞后，以代码为准）
- 架构设计：[`docs/architecture.md`](./docs/architecture.md)
- 三端虚拟网卡（TUN）实现记录：[`docs/superpowers/plans/2026-08-05-aurestream-v2-tun-three-platforms.md`](./docs/superpowers/plans/2026-08-05-aurestream-v2-tun-three-platforms.md)
