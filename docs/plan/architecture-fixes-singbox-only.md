# sing-box 单内核架构修复记录

## 已落地（历史）

1. **前端控制面**：`src/utils/singbox-api/` 统一封装 sing-box `experimental.clash_api` REST。
2. **Store 命名**：`singbox_api_port_key` / `singbox_api_secret_key`，自动迁移旧 `clash_api_*` 键。
3. **就绪探测**：`readiness.rs` 使用 `controller_port()`，与设置一致。
4. **启动校验**：`core/config_check.rs` 在 `start` 前执行 `aurestream-core check -c`。
5. **移除 `ManualProxy`**：仅 `SystemProxy` / `IntoProxy`。
6. **UA / 规则占位符 / architecture.md** 已对齐。

## 本轮审计与修复（core 分层）

### 已修复

| 问题 | 处理 |
|------|------|
| `mod.rs` 臃肿（端口、ProcessManager、探针） | 拆至 `core/ports.rs`、`core/process.rs`；`mod.rs` 仅命令与编排 |
| `ports.rs` 与 `mod.rs` 重复实现 | 删除 `mod.rs` 内重复，统一 `pub(crate) use ports::*` |
| `reload_config` 未校验配置 | 重启前 `config_check::verify`（读 `ProcessManager.config_path`） |
| `is_running(secret)` 误导 | 改为无参 `is_running()`，仅查状态机；移除 `AppData.controller_secret` |
| `dns.rs` 经 secret 调 `is_running` | 直接读 `EngineStateCell` |
| prestart 只清 mixed 端口 | `start` 时对 mixed + controller 端口各执行 `kill_orphans`（端口相同时只一次） |
| `vpn-service.isRunning(secret)` 未使用 | 重命名为 `isEngineRunning()` 且无参 |

### 仍待处理（建议后续）

| 问题 | 说明 |
|------|------|
| 默认端口双份维护 | Rust `ports.rs` 与 TS `definition.ts` 均为 2345/9191，需约定改端口时同步 |
| 设置页 bypass 列表未接线 | `SettingsPage` 的 `bypassList` 仅 UI 状态，未写入 `sysproxy`（`engine/common/sysproxy.rs` 硬编码 `DEFAULT_BYPASS`） |
| Windows `restart` 使用 `epoch: 0` | `engine/windows/mod.rs` 内 stop→start 未传递真实 epoch，监控/状态机边界需单独评审 |
| `engine/macos/mod.rs` 过大 | ~700+ 行，建议拆 sidecar / helper / dns |
| 磁盘上的 `core/kernel.rs`、`core/kernels/*` | **未**在 `core/mod.rs` 注册，不参与编译；可删除或另开分支落地插件架构 |
| `onebox_lifecycle` 外部依赖 | 仍来自 OneOhCloud git tag |
| 就绪探测仅 TCP 连通 | 未带 Bearer 调 `/version`；一般足够 |
| TUN 停止后仍只日志 mixed 端口 | 与 mixed inbound 是否监听有关，行为可接受 |

## 模块索引

| 文件 | 职责 |
|------|------|
| `core/mod.rs` | Tauri 命令：start/stop/reload/is_running |
| `core/ports.rs` | mixed/controller 端口、TCP 探针 |
| `core/process.rs` | ProcessManager、会话快照、`get_running_config` 数据 |
| `core/config_check.rs` | sidecar `check -c` |
| `core/monitor.rs` | 子进程 stdout/stderr、退出回调 |
| `core/log.rs` | 侧车日志文件 |
