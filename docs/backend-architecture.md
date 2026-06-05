# 后端架构

AureStream 的后端由 Rust 编写，基于 Tauri v2 框架构建，负责系统级权限操作、进程管理与网络控制。

## 1. 后端概述
- **框架**: Tauri v2
- **运行时**: Tokio async
- **指令集**: 注册了 28 个 Tauri 命令，分为 5 大类别。
- **插件**: 集成了 15 个 Tauri 插件。

## 2. 入口与初始化
- `main.rs`: Windows Release 构建时隐藏控制台，调用 `aurestream_lib::run()`。
- `lib.rs`: 强制单实例运行，支持便携模式，注册所有 Tauri Commands。
- `app/setup.rs`: 初始化 `AppData` 和 `EngineStateCell`，启动时清理遗留的 TUN 服务，复制数据库/配置文件。设置系统托盘菜单，支持 Deep Link，注册生命周期监听器（如网络断开/重连触发防抖重启，系统休眠/唤醒处理）。

## 3. 核心引擎 (src-tauri/src/core/)

### mod.rs - Engine Commands
- `start()`: 验证配置 → 清理冲突端口 → 状态机流转 (Idle→Starting→Running) → 启动 readiness 探测。
- `stop()`: 状态流转 → 调用 `PlatformEngine::stop` → 清理 `ProcessManager`。
- `reload_config()`: 配置检查 → `PlatformEngine::restart` → 重新应用系统代理。
- **状态机**: 引擎状态通过 `EngineState` 枚举表示，采用基于 Intent 的过渡。

### process.rs - ProcessManager
- 维护全局 `PROCESS_MANAGER` 单例，管理运行会话的快照状态。

### ports.rs - Port Utilities
- 代理端口与控制端点端口管理，TCP 探测功能，遗留孤儿进程检测。

### config_check.rs - Config Validation
- 执行内核命令 `aurestream-core check -c config.json` 进行配置校验。

### monitor.rs - Process Monitoring
- 捕获子进程 `stdout`/`stderr`，处理进程退出回调事件。

### log.rs - Log Management
- sidecar 进程日志文件管理，限制最大 50MB，支持轮转滚动。

## 4. 引擎平台实现 (src-tauri/src/engine/)

### mod.rs - EngineManager Trait
- 定义 `ProxyMode` 枚举: `SystemProxy` | `IntoProxy` (TUN)。
- `EngineManager` 接口: 包含 `start`, `stop`, `restart`, `network_changed`, `ensure_installed` 等平台抽象。
- 根据目标操作系统分发到 `WindowsEngine` | `MacOSEngine` | `LinuxEngine`。
- `cleanup_on_shutdown()`: 程序退出时卸载系统代理。

### 平台特异性实现
- **Windows (`windows/mod.rs`)**: 
  - TUN 模式依赖 Windows SCM 服务 (`AureStreamTunService` 作为 `LocalSystem` 运行)。
  - 系统代理使用基于 WinINet 的注册表配置。
  - 支持 UWP 应用本地回环豁免 (`sysproxy-rs` 处理)。
- **macOS (`macos/mod.rs`)**: 
  - 集成提权 Helper Tool (`SMJobBless` + XPC IPC)。
  - `dns_watcher.rs`: 基于 `SCDynamicStore` 监控 DNS 变化。
  - `watchdog.rs`: 提供内核进程监控看门狗。
- **Linux (`linux/mod.rs`)**: 
  - 采用 `pkexec` 提升权限，并集成 `systemd-resolved` 调整 DNS。

## 5. 命令模块 (src-tauri/src/commands/)

| 模块文件 | 主要命令 | 说明 |
|---|---|---|
| `config_fetch.rs` | `fetch_config_with_optimal_dns` | 带 CDN 回退和最佳 DNS 优选的订阅抓取 |
| `dns.rs` | `get_optimal_local_dns_server` 等 | 29个 DNS 服务器的并发延迟基准测试 |
| `network.rs` | `get_lan_ip`, `ping_google` 等 | 网络探针工具集 |
| `prestart.rs` | *(internal)* | 端口冲突与环境预检 |
| `shell.rs` | `version`, `read_logs`, `quit` 等 | 应用程序级生命周期管理 |
| `theme.rs` | `set_native_window_theme` | 原生系统窗口主题同步 |
| `whitelist.rs` | *(internal)* | 域名白名单管理逻辑 |

## 6. 安全设计
- **权限分离**: Windows SCM, macOS XPC, Linux pkexec。通过后台服务执行高权限网络操作，UI 层保持低权限。
- **防注入**: Sidecar 执行参数静态定义在 `tauri.conf.json` 中，杜绝命令行注入风险。
