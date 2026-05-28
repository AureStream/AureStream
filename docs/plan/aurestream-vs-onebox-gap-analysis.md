# AureStream vs OneBox 功能差距分析

> 对比日期: 2026-05-28
> AureStream 版本: 0.1.0 | OneBox 版本: 1.4.29
> 引擎差异: AureStream 使用 Mihomo (Clash Meta)，OneBox 使用 sing-box

---

## 一、Rust 后端缺失

### 1.1 整个目录缺失

| 模块 | 文件数 | 说明 |
|---|---|---|
| `src/core/` | 3 | ProcessManager、进程监控、日志管理 |
| `src/commands/` | 7 | 所有 Tauri 命令 (网络/DNS/Shell/配置拉取/预检等) |

#### core/ 目录 (3 文件)

| 文件 | 功能 |
|---|---|
| `core/mod.rs` | `ProcessManager` 结构体 (子进程句柄、模式、配置路径、is_stopping 标志)；`start`/`stop`/`is_running`/`get_engine_state`/`clear_engine_error`/`reload_config` Tauri 命令；`mixed_proxy_port` 配置读取；`probe_port_listening` TCP 端口探测；`pid_is_alive` 进程存活检查；action-token 诊断日志；`DEFAULT_MIXED_PROXY_PORT` 常量 (6789) |
| `core/monitor.rs` | `spawn_process_monitor` — 监听 sidecar stdout/stderr 的 tokio 任务；`scan_stderr_for_bind_error` — 端口绑定失败检测；`handle_process_termination` — 进程退出后的清理 (模式匹配、代理清除、状态机转换)；`epoch_guard_stale` — 过期会话检测；Windows 退出码重映射 |
| `core/log.rs` | 按日轮转的 sidecar 日志写入器；超 10MB 自动 gzip 压缩；7 天日志自动清理；`cleanup_old_onebox_logs` 应用日志清理；`prepare_singbox_log_dir` 文件系统辅助 |

#### commands/ 目录 (7 文件)

| 文件 | 功能 |
|---|---|
| `commands/mod.rs` | 模块声明 |
| `commands/config_fetch.rs` | 订阅配置拉取器 (最优 DNS 解析 + CDN 加速回退)；`fetch_config_with_optimal_dns`、`verify_deep_link_url` Tauri 命令 |
| `commands/dns.rs` | DNS 基准测试 (29 个公共解析器并发测速)；原始 UDP A 记录解析；`get_optimal_local_dns_server` Tauri 命令 |
| `commands/network.rs` | 局域网 IP 检测 (Windows/Linux/macOS)；Captive Portal 检测；`ping_google` 代理穿透测试；`open_browser` (停止代理后打开浏览器) |
| `commands/prestart.rs` | 端口占用检查；孤儿进程 PID 检测和清理 (跨平台: netstat/lsof/fuser) |
| `commands/shell.rs` | `get_tray_icon`、`open_directory`、`create_window`、`get_app_version`、`get_app_paths`、`open_devtools`、`quit`/`sync_quit`、`read_logs`、`get_pending_deep_link`、`version` (sidecar 版本) |
| `commands/theme.rs` | macOS 原生 NSWindow.appearance 覆写 (Objective-C FFI) |
| `commands/whitelist.rs` | 订阅域名 SHA256 白名单；编译时常量列表 + 远程刷新 (24h)；`tauri-plugin-store` 持久化 |

### 1.2 现有目录中缺失的文件

| 文件 | 说明 |
|---|---|
| `app/events.rs` | 菜单事件处理 (show/quit/enable)；窗口事件 (CloseRequested 拦截 → 最小化到托盘)；运行事件 (macOS Reopen、Ready 生命周期监听、Exit 最终清理) |
| `engine/windows/native.rs` | Windows 注册表 DNS 操控 (`HKLM\...\Tcpip\Parameters\Interfaces`)；NIC 枚举；`ShellExecuteExW` + `runas` UAC 提权；helper 子命令分发 (start/stop/restore-dns/install-service/uninstall-service) |
| `engine/windows/watchdog.rs` | 1Hz 轮询 Windows 服务状态 (`tun_service::scm::query_state`)；服务从 Running 转 Stopped 时合成 `handle_process_termination` |
| `engine/macos/helper.rs` | XPC 辅助进程 Rust 端封装: ping、install、start/stop/reload sidecar、设置 IP 转发、设置 DNS、刷新 DNS 缓存、移除 TUN 路由 |
| `engine/macos/helper.m` | XPC 辅助进程 Objective-C 端实现 |
| `engine/macos/watchdog.rs` | macOS TUN 模式 bypass-router 重启看门狗；周期性重启 sidecar 刷新路由表 (4/12/24h 可配置) |
| `engine/macos/dns_watcher.rs` | SCDynamicStore DNS 变更监听器；检测手动 DNS 编辑、MDM/VPN 覆写；独立 CFRunLoop 线程 |

### 1.3 现有文件功能缺失

| 文件 | 缺失内容 |
|---|---|
| `lib.rs` | 无 `mod commands`、`mod core` 声明；`invoke_handler` 只注册了 `greet`；无 `.on_menu_event()` / `.on_window_event()` / `.on_run_event()` 事件绑定；无 `.build()` 调用 (直接 `.run()`) |
| `app/setup.rs` | 未管理 `EngineStateCell` 状态；未调用 `copy_database_files`；未启动生命周期监听器；未清理旧日志；未处理 Captive Portal |
| `app/plugins.rs` | 缺少 shell、log、http、fs、dialog、process、deep-link、autostart、single-instance、updater、window-state、clipboard-manager 等插件注册 |
| `engine/common/sysproxy.rs` | `set_system_proxy` / `clear_system_proxy` 是空壳 stub (只打日志，不实际操作系统代理) |
| `engine/windows/mod.rs` | `WindowsEngine` 的 `start`/`stop`/`restart` 全部是 stub (只打日志返回 Ok) |
| `utils.rs` | 缺少 `purge_legacy_cache_files` 函数 |

### 1.4 缺失的 Cargo 依赖

**核心依赖 (引擎启停必需):**

| Crate | 用途 |
|---|---|
| `tauri-plugin-shell` | sidecar 进程管理 (引擎启停的核心依赖) |
| `lazy_static = "1.5.0"` | `PROCESS_MANAGER` 全局静态变量 |
| `onebox-sysproxy-rs` | 系统代理设置/清除 (git 依赖) |

**日志与序列化:**

| Crate | 用途 |
|---|---|
| `tauri-plugin-log` | 应用日志系统 (KeepAll 轮转策略) |
| `chrono` | 日志文件名日期格式化 |
| `flate2 = "1.0"` | 日志 gzip 压缩 |

**网络与配置:**

| Crate | 用途 |
|---|---|
| `tauri-plugin-http` | HTTP 客户端 (订阅配置拉取、Captive Portal、白名单) |
| `tauri-plugin-fs` | 文件系统插件 |
| `url = "2"` | URL 解析 |
| `sha2 = "0.10"` | SHA256 白名单域名哈希 |
| `uuid = "1.16.0"` (v4) | 订阅标识符生成 |

**UI 与交互:**

| Crate | 用途 |
|---|---|
| `tauri-plugin-dialog` | 文件/消息对话框 |
| `tauri-plugin-process` | 进程生命周期插件 |
| `tauri-plugin-clipboard-manager` | 剪贴板集成 |
| `webbrowser = "1.0.4"` | 浏览器打开 (Captive Portal 流程) |
| `rand = "0.10.0"` | 随机数生成 |
| `png = "0.18.1"` | 托盘图标 PNG 编码 |

**高级功能:**

| Crate | 用途 |
|---|---|
| `tauri-plugin-deep-link` | 深度链接处理 |
| `tauri-plugin-autostart` | 开机自启 |
| `tauri-plugin-single-instance` | 单实例强制 |
| `tauri-plugin-updater` | 自动更新 |
| `tauri-plugin-window-state` | 窗口状态持久化 |
| `onebox_lifecycle` | 系统关机/休眠/唤醒生命周期事件 (git 依赖) |

**平台特定:**

| Crate | 平台 | 用途 |
|---|---|---|
| `windows = "0.62.2"` | Windows | 注册表、Shell、Threading、Services API |
| `winapi = "0.3"` | Windows | `CREATE_NO_WINDOW` 子进程标志 |
| `tun-service` | Windows | Windows SCM 服务 (TUN 模式) |
| `system-configuration` | macOS | SCDynamicStore DNS 监听 |
| `core-foundation` | macOS | macOS Core Foundation 类型 |
| `gtk` / `gdk` | Linux | GTK CSD HeaderBar CSS 注入 |
| `libc` | Unix | POSIX `kill(pid, 0)` 进程探测 |

**Tauri feature 缺失:**

AureStream 的 `tauri` 依赖缺少 `tray-icon`、`devtools`、`image-png` features。

**构建依赖缺失:**

| Crate | 平台 | 用途 |
|---|---|---|
| `cc = "1"` | macOS | 编译 Objective-C helper.m 文件 |

---

## 二、前端缺失

### 2.1 Hooks (AureStream 为零)

AureStream 没有任何自定义 Hook，OneBox 有 5 个核心 Hook + 2 个 Action Hook:

| Hook | 文件 | 功能 |
|---|---|---|
| `useEngineState` | `hooks/useEngineState.ts` | 实时引擎状态 (idle/starting/running/stopping/failed)；通过 Tauri 事件订阅状态机变化 |
| `useDB` | `hooks/useDB.ts` | `useSubscriptions()` — SWR 驱动的订阅列表查询 |
| `useTheme` | `hooks/useTheme.ts` | 完整主题系统: 亮/暗/跟随系统偏好、跨窗口同步、原生 chrome (macOS 标题栏)、持久化存储 |
| `useVersion` | `hooks/useVersion.ts` | `useVersion()` + `useIsRunning()` — 每秒轮询 VPN 运行状态 |
| `useUpdateSubscription` | `action/subscription-hooks.ts` | 订阅更新: loading/message 状态、流量解析 |
| `useModalState` | `action/modal-state-hook.ts` | 表单状态 + Zod 验证、深链接集成 |

### 2.2 工具模块 (全部缺失)

| 模块 | 文件 | 功能 |
|---|---|---|
| Clash API 服务 | `utils/clash-api.ts` | Clash API 客户端 (日志/流量/连接管理)；`useLogSource()` 日志流；`useNetworkSpeed()` 实时网速；`formatNetworkSpeed()` 格式化 |
| VPN 服务管理 | `utils/helper.ts` | VPN 服务管理器 (`start`/`stop`/`reload`)；i18n 国际化系统 (`t()`)；OS 信息获取；剪贴板代理复制；User-Agent 构建器；配置同步 |
| 自动更新 | `utils/update.ts` | 版本检查/下载/安装；分阶段发布 (dev/beta/stable)；签名失败限流；重启标记 |

### 2.3 页面缺失

| 页面 | 功能 |
|---|---|
| `log.tsx` | 日志查看器 + 配置查看器 + 配置模板编辑器 (三 Tab 页面) |
| `developer.tsx` | 开发者选项: bypass-router、DHCP、DNS 设置、dev 开关、主题、TUN 栈、UA、阶段选择、系统代理 |
| `router.tsx` | 自定义路由规则: 域名/后缀/CIDR 分流 (直连/代理) |

### 2.4 组件缺失 (约 40+)

**Home 组件:**

| 组件 | 功能 |
|---|---|
| `power-toggle.tsx` | VPN 开关按钮 |
| `mode-switcher.tsx` | 规则/全局/直连模式切换器 |
| `status-display.tsx` | 引擎状态视觉指示器 |
| `deep-link-apply-progress-modal.tsx` | 深链接导入进度流水线 |
| `prestart-repair-modal.tsx` | 启动前修复对话框 (端口占用检测) |
| `network-check.tsx` | 网络连通性检查 |
| `select-config.tsx` | 配置文件选择器 |
| `hooks.ts` | `useProxyMode`、`useVPNOperations`、`useModeIndicator` |

**Configuration 组件:**

| 组件 | 功能 |
|---|---|
| `detail-modal.tsx` | 订阅详情视图 |
| `modal.tsx` | 添加/编辑订阅弹窗 (Zod 表单验证) |
| `avatar.tsx` | 订阅头像/图标 |
| `item.tsx` | 订阅列表项 |

**Log 组件 (整个模块):**

| 组件 | 功能 |
|---|---|
| `log-table.tsx` | 日志表格 (带过滤) |
| `empty-log-message.tsx` | 空状态占位 |
| `types.ts` | LogEntry 类型定义 |

**Config Viewer/Template (整个模块):**

| 组件 | 功能 |
|---|---|
| `config-viewer.tsx` | 实时配置查看器 |
| `config-template.tsx` | 配置模板编辑器 |

**Developer 组件 (整个模块, 12 个):**

| 组件 | 功能 |
|---|---|
| `bypass-router.tsx` / `bypass-router-watchdog.tsx` | 绕过路由器看门狗 |
| `dev-toggle.tsx` | 开发模式开关 |
| `dhcp-toggle.tsx` | DHCP 开关 |
| `dns-settings.tsx` | DNS 设置 |
| `ua-settings.tsx` | User-Agent 设置 |
| `helper-ping.tsx` | 辅助进程连通性测试 |
| `local-config-toggle.tsx` | 本地配置开关 |
| `system-proxy-toggle.tsx` | 系统代理开关 |
| `select-stage.tsx` | 发布阶段选择 (dev/beta/stable) |
| `tun-stack.tsx` | TUN 栈选择 |
| `theme-toggle.tsx` | 主题切换 |

**Settings 组件:**

| 组件 | 功能 |
|---|---|
| `auto-start.tsx` | 开机自启设置 |
| `lan.tsx` | 局域网访问设置 |
| `language.tsx` | 语言切换设置 |
| `proxy-port.tsx` | 代理端口设置 |
| `tun.tsx` | TUN 虚拟网卡设置 |
| `router-settings.tsx` | 路由器设置帮助 |
| `about.tsx` | 关于页面 |
| `updater.tsx` / `updater-button.tsx` / `update-context.tsx` | 自动更新 UI |

**Common 组件:**

| 组件 | 功能 |
|---|---|
| `ios-text-field.tsx` | iOS 风格文本输入框 |
| `portal.tsx` | React Portal 工具 |
| `radio-option-list.tsx` | 单选列表 |
| `settings-modal.tsx` | 设置弹窗 |

### 2.5 类型定义缺失

| 类型 | 功能 |
|---|---|
| `types/engine-state.ts` | `EngineState` 判别联合类型 (idle/starting/running/stopping/failed + epoch) |
| `types/copyright.ts` | 版权信息类型 |

### 2.6 其他基础设施缺失

| 模块 | 功能 |
|---|---|
| `single/context.ts` | NavContext — 深链接路由、屏幕导航、自启动标志 |
| `tray.tsx` | 系统托盘 (代理切换、剪贴板复制、状态轮询) |
| `window-manager.tsx` | 多窗口管理器 (主窗口 + 日志窗口) + 跨窗口主题同步 |
| `__tests__/` | 前端测试 |

---

## 三、优先级分层

### P0 — 核心 (引擎可启停)

让 Mihomo sidecar 能够被启动、监控、停止。没有这些，其他功能全部无意义。

- [ ] 添加 `tauri-plugin-shell` 依赖 (sidecar 进程管理)
- [ ] 添加 `lazy_static`、`onebox-sysproxy-rs` 等核心依赖
- [ ] 创建 `src/core/mod.rs` — `ProcessManager` + `start`/`stop`/`is_running`/`get_engine_state` Tauri 命令
- [ ] 创建 `src/core/monitor.rs` — `spawn_process_monitor` + `handle_process_termination`
- [ ] 实现 `engine/windows/mod.rs` 的 `WindowsEngine::start` (spawn mihomo sidecar) 和 `stop` (kill 进程)
- [ ] 实现 `engine/common/sysproxy.rs` — 真实的系统代理设置/清除
- [ ] 更新 `lib.rs` — 注册 `core` 模块、`invoke_handler` 注册引擎命令
- [ ] 更新 `app/setup.rs` — 管理 `EngineStateCell`、复制数据库文件

### P1 — 完整 (前后端联通)

让 UI 控制真实引擎，而非 mock 状态。

- [ ] 创建 `src/commands/shell.rs` — `read_logs`、`get_app_version`、`get_app_paths` 等
- [ ] 创建 `src/commands/network.rs` — `get_lan_ip`、`ping_google`
- [ ] 创建 `src/commands/prestart.rs` — 端口占用检查
- [ ] 创建 `src/app/events.rs` — 关闭到托盘、系统关机清理
- [ ] 添加 `tauri-plugin-log`、`tauri-plugin-http` 等插件
- [ ] 前端: 创建 `hooks/useEngineState.ts` — 订阅引擎状态事件
- [ ] 前端: 创建 `utils/helper.ts` — VPN 服务管理器 (`invoke("start")`/`invoke("stop")`)
- [ ] 前端: 创建 `types/engine-state.ts` — 前端状态类型
- [ ] 前端: 更新 `ConnectionPanel.tsx` — 用 `invoke` 替换本地 `useState`
- [ ] 前端: 更新 `NodeSelector.tsx` — 从真实订阅配置读取节点

### P2 — 平台增强 (TUN 模式)

平台特定的高级功能。

- [ ] 创建 `engine/windows/native.rs` — 注册表 DNS 操控、UAC 提权
- [ ] 创建 `engine/windows/watchdog.rs` — Windows 服务状态看门狗
- [ ] 创建 `engine/macos/helper.rs` + `helper.m` — XPC 辅助进程
- [ ] 创建 `engine/macos/watchdog.rs` — bypass-router 重启看门狗
- [ ] 创建 `engine/macos/dns_watcher.rs` — SCDynamicStore DNS 监听
- [ ] 创建 `src/commands/dns.rs` — DNS 基准测试
- [ ] 创建 `src/commands/config_fetch.rs` — 订阅配置拉取 (DNS 优化)

### P3 — 体验完善

- [ ] 前端: 创建 `utils/clash-api.ts` — Clash API 客户端、实时网速
- [ ] 前端: 创建 `log.tsx` 页面 + log-table 组件
- [ ] 前端: 创建 `developer.tsx` 页面 + 12 个开发者组件
- [ ] 前端: 创建 `settings/` 下缺失的组件 (auto-start、updater 等)
- [ ] 添加 `tauri-plugin-autostart`、`tauri-plugin-deep-link`
- [ ] 添加 `tauri-plugin-updater` + 前端 `utils/update.ts`

### P4 — 高级功能

- [ ] 前端: 创建 `router.tsx` — 自定义路由规则编辑器
- [ ] 前端: 多窗口管理 (`window-manager.tsx`)
- [ ] 前端: 系统托盘集成 (`tray.tsx`)
- [ ] 前端: i18n 完整语言切换
- [ ] 前端: 配置模板编辑器 (`config-template.tsx`)

---

## 四、关键差异说明

### 4.1 引擎差异

| 维度 | AureStream (Mihomo) | OneBox (sing-box) |
|---|---|---|
| Sidecar 名称 | `mihomo` | `sing-box` |
| 启动命令 | `mihomo run -c <config> --dir <dir>` | `sing-box run -c <config> --disable-color` |
| Clash API 端口 | 9191 (已有 readiness.rs 配置) | 9191 (相同) |
| 默认混合代理端口 | 6789 (已配置) | 6789 (相同) |
| TUN 模式 | 待实现 | Windows SCM 服务 + macOS XPC helper |

### 4.2 架构差异

OneBox 将引擎生命周期命令放在 `core/mod.rs` 中 (start/stop/is_running 等)，而 AureStream 当前只有一个 `greet` 命令在 `lib.rs`。AureStream 的 `engine/common/` 已有状态机、readiness prober、helper、sysproxy 的文件结构，但 sysproxy 是空壳，状态机未被使用。

### 4.3 Tauri 插件差异

AureStream 当前只注册了 4 个插件 (store、os、sql、opener)，OneBox 注册了 18+ 个插件。插件缺失直接导致前端无法调用 shell (sidecar 管理)、http (订阅拉取)、fs (配置文件读写) 等能力。
