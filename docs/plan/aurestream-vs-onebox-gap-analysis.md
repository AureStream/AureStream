# AureStream vs OneBox 功能差距分析

> 对比日期: 2026-05-28
> AureStream 版本: 0.1.0 | OneBox 版本: 1.4.29
> 引擎：AureStream 和 OneBox 均使用 sing-box 作为核心引擎。

---

## 一、Rust 后端实现进度与缺失分析

### 1.1 核心（core/ 与 基础结构）
* **进度**：**已实现**。`core/mod.rs`（ProcessManager 句柄、Tauri 命令等）、`core/monitor.rs`（sidecar 监控与进程退出处理）和 `core/log.rs`（日志轮转写入与压缩清理）已完整迁移并与 sing-box 引擎相匹配。
* **缺失**：无显著核心文件结构缺失。

### 1.2 命令层（commands/ 目录）
AureStream 当前已有基本命令模块：`shell.rs`、`network.rs`、`prestart.rs`、`dns.rs` (基础探测部分已补齐)，但相比 OneBox 依然缺失了以下高级命令组件：

| 缺失文件 | 功能描述 |
|---|---|
| `commands/config_fetch.rs` | 订阅配置拉取器 (支持最优 DNS 解析 + CDN 加速回退)；`fetch_config_with_optimal_dns` 等 Tauri 命令 |
| `commands/dns.rs` | 完整的 DNS 基准测试 (对 29 个公共解析器并发测速) 尚未完全对齐 |
| `commands/theme.rs` | macOS 原生 NSWindow.appearance 覆写 (配合 `macos_theme.m` 实现暗色模式强行注入) |
| `commands/whitelist.rs` | 订阅域名 SHA256 白名单与持久化验证 |

### 1.3 平台特定引擎支持（engine/ 目录）

| 平台 | 文件 / 模块 | 当前状态 |
|---|---|---|
| **Windows** | `engine/windows/mod.rs` | **已完成**。已支持基础侧车拉起与 `onebox-sysproxy-rs` 代理设置。 |
| | `engine/windows/native.rs` | **缺失**。注册表 DNS 接管、NIC 枚举、`ShellExecuteExW` UAC 提权等高级功能尚未实现。 |
| | `engine/windows/watchdog.rs` | **缺失**。Windows SCM 服务状态的 1Hz 轮询守护与终止清理合并。 |
| **macOS** | `engine/macos/` | **已完成**。已实现 `dns_watcher.rs`（SCDynamicStore 监听）、`helper.m` 与 `helper.rs`（AureStream XPC 辅助进程客户端及 FFI），以及 `watchdog.rs`（看门狗路由刷新）和完整的 `MacOSEngine` 启停逻辑。 |
| **Linux** | `engine/linux/mod.rs` | **已完成**。已实现 `pkexec` 拉起特权 helper 脚本、systemd-resolved 的 DNS 劫持和恢复。 |

---

## 二、前端实现进度与缺失分析

### 2.1 Hooks 差异
AureStream 当前已有 `useEngineState.ts` 和 `useSubscriptions.ts`，但相比 OneBox 缺少以下 Hook：

| 缺失 Hook | 功能描述 |
|---|---|
| `hooks/useTheme.ts` | 完整的主题系统：亮/暗/跟随系统偏好，支持跨窗口同步与持久化 |
| `hooks/useVersion.ts` | VPN 运行状态的定时轮询（每秒检查） |
| `hooks/useSwr.ts` | 用于处理数据请求的全局 SWR 驱动包装 |

### 2.2 工具服务模块（utils/）
AureStream 前端仅有 `vpn-service.ts`（用于调用 Tauri 指令启停进程），缺失以下组件：
* `utils/clash-api.ts`：内核交互客户端（处理日志读取、实时流量、网速、节点选择与连接断开等）。
* `utils/helper.ts`：通用的本地化国际化翻译函数 `t()`、OS 信息获取以及 UA 解析器。
* `utils/update.ts`：客户端在线自动升级、分阶段（dev/beta/stable）发布检测等。

### 2.3 页面模块（page/）
AureStream 主界面采用 `HomePage.tsx`、`SubscriptionPage.tsx` 与 `SettingsPage.tsx` 三个页面；侧边栏仅保留首页、订阅管理与设置。以下 OneBox 独立页面**有意不纳入当前产品范围**（相关能力仍可通过配置合并层 / Store 在后台生效，但无独立 UI）：

| 页面（OneBox） | 说明 |
|---|---|
| `log.tsx` | 侧车日志监控 — 后端 `read_logs` 保留，无前端入口 |
| `developer.tsx` | 开发者开关 — Store 键仍可由配置流程读取 |
| `router.tsx` | 自定义分流规则 — `getCustomRuleSet` 仍参与配置生成 |

### 2.4 其他基础设施
* 缺少多窗口管理器 `window-manager.tsx`（主窗口与独立日志窗口的主题/状态同步）。
* 缺少前端状态托盘组件 `tray.tsx`。

---

## 三、后续工作优先级建议

1. **P0 (已完成)**：macOS 引擎看门狗、XPC helper 以及 Linux 引擎特权劫持机制已完全对接，测试通过。
2. **P1**：从 OneBox 中补齐 `config_fetch.rs`（最优 DNS 测速拉取订阅）以及 `whitelist.rs`（白名单控制）。
3. **P2**：重构并补齐前端内核交互组件 `clash-api.ts`，以便前端能实时与后台内核（例如日志流、连接数、节点延迟）交换数据。
4. ~~**P3**：补齐前端高级控制台页面~~（当前产品范围外；若需恢复，可再评估独立页面或设置内折叠面板）。
