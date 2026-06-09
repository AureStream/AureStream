# 后端架构

AureStream 的后端由 Rust 编写，基于 Tauri v2 框架构建，负责系统级权限操作、进程管理与网络控制。

## 1. 后端概述
- **框架**: Tauri v2
- **运行时**: Tokio async
- **Tauri Commands**: 约 20 个（见 `src-tauri/src/lib.rs`）
- **插件**: Shell、OS、Store、SQL、Process、Autostart、Updater 等

## 2. 入口与初始化
- `main.rs`: Windows Release 构建时隐藏控制台，调用 `aurestream_lib::run()`。
- `lib.rs`: 单实例、便携模式、注册全部 Commands。
- `app/setup.rs`: 初始化 `AppData`、清理遗留 TUN 服务、托盘菜单、Deep Link、网络变化防抖重启；页面加载完成后显示主窗口。
- `app/plugins.rs`: 插件注册；应用日志带毫秒级时间戳。
- `app/events.rs`: 窗口/运行事件、休眠唤醒、`cleanup_on_shutdown`。

## 3. 核心引擎 (`src-tauri/src/core/`)

### mod.rs - Engine Commands
- `start()`: 配置校验（可跳过已 `mark_config_verified` 的重复 check）→ 端口清理 → 状态机 Idle→Starting→Running。
- `stop()`: Stopping → `PlatformEngine::stop` → 端口释放轮询 → Idle。
- `reload_config()`: 配置检查 → `PlatformEngine::restart` → 重新应用系统代理。
- `get_engine_state()` / `clear_engine_error()`。

### process.rs - ProcessManager
- 全局 `PROCESS_MANAGER` 单例，维护 sidecar 子进程与会话快照。

### ports.rs - Port Utilities
- 代理端口与控制端口解析；`wait_for_port_release` 供停止流程轮询端口释放。

### config_check.rs - Config Validation
- `aurestream-core check -c config.json`；`mark_config_verified` 供前端预合并后标记。

### monitor.rs / log.rs
- 子进程 stdout/stderr 捕获；sidecar 日志轮转（最大 50MB）。

### perf.rs
- Rust 侧可选耗时统计，配合前端 perf 模块。

## 4. 引擎平台实现 (`src-tauri/src/engine/`)

### mod.rs - EngineManager Trait
- `ProxyMode`: `SystemProxy` | `IntoProxy` (TUN)。
- 平台分发：`WindowsEngine` | `MacOSEngine` | `LinuxEngine`。
- `engine_ensure_installed` / `engine_uninstall_service` / `engine_probe`。

### common/
- `state_machine.rs`: 引擎状态机。
- `readiness.rs`: Clash API 端口就绪探测。
- `shutdown.rs`: 停止后 mixed/controller 端口释放轮询（最长 3s）。

### 平台特异性实现
- **Windows**: SCM 服务 `AureStreamTunService`；WinINet 系统代理；UWP 环回豁免。
- **macOS**: SMJobBless + XPC Helper；`dns_watcher`；`watchdog`；Helper 支持自卸载。
- **Linux**: `pkexec` + `aurestream-tun-helper`（打包于 `src-tauri/resources/linux/`）；`systemd-resolved` DNS；deb/rpm 安装 polkit 策略与 udev 规则。

## 5. 命令模块 (`src-tauri/src/commands/`)

| 模块 | 主要命令 | 说明 |
|------|----------|------|
| `config_fetch.rs` | `fetch_config`, `verify_deep_link_url` | 订阅抓取与 Deep Link 校验 |
| `network.rs` | `ping_tcp`, `get_geoip_info` | TCP 测速与 GeoIP |
| `prestart.rs` | *(internal)* | 启动前端口冲突预检 |
| `shell.rs` | `version`, `read_logs`, `get_config_json_path`, `get_app_paths`, `quit`, `restart` 等 | 生命周期与路径 |
| `theme.rs` | `set_native_window_theme` | 原生窗口主题 |

> 历史 DNS 探测类命令已移除；DNS 相关逻辑由 sing-box 配置模板与合并器负责。

## 6. 打包资源

| 路径 | 说明 |
|------|------|
| `src-tauri/resources/linux/` | Linux deb/rpm 安装脚本、polkit、udev、TUN helper |
| `src-tauri/resources/main.desktop` | Linux 桌面入口 |
| `src-tauri/tauri.linux.conf.json` | Linux 打包额外资源映射 |
| `helper/` | macOS 特权 Helper（XPC） |
| `tun-service/` | Windows TUN SCM 服务 |

## 7. 安全设计
- **权限分离**: Windows SCM、macOS XPC、Linux pkexec + polkit。
- **防注入**: Sidecar 参数静态定义于 `tauri.conf.json`。
- **退出清理**: `cleanup_on_shutdown` 清除系统代理与 DNS 劫持残留。
