# AureStream 代码审查报告

> 审查日期：2026-06-03
> 审查范围：全项目（前端 React/TypeScript + 后端 Rust/Tauri + 配置层）
> 方法：多维度并行扫描 38 个可疑点 → 对抗性验证 → 确认 18 个真实问题

---

## 🔴 HIGH — 建议尽快修复

### 1. Tauri 事件监听器泄漏 + 竞态条件

- **类别：** Bug
- **文件：** `src/hooks/useEngineState.ts:25-33`
- **描述：** `listen()` 返回 Promise，如果组件在 Promise 解析前卸载，`unlisten` 仍为 `undefined`，监听器永远不会被移除。同时 `getEngineState()` 没有取消守卫，React StrictMode 双挂载时旧 Promise 可能覆盖新状态。
- **修复：**

```ts
useEffect(() => {
  let cancelled = false;
  let unlisten: (() => void) | undefined;
  getEngineState().then((state) => { if (!cancelled) setEngineState(state); })
    .catch(...).finally(() => { if (!cancelled) setLoading(false); });
  listen<EngineState>('engine-state', (event) => {
    if (!cancelled) setEngineState(event.payload);
  }).then((fn) => { unlisten = fn; });
  return () => { cancelled = true; unlisten?.(); };
}, []);
```

---

### 2. Unix 单实例锁 TOCTOU 竞态

- **类别：** Bug
- **文件：** `src-tauri/src/app/single_instance.rs:58-84`
- **描述：** Unix 单实例实现使用 check-then-create 模式，`fs::remove_file`（第77行）→ `File::create`（第81行）之间存在竞态窗口。未使用 `flock()` 或 `O_CREAT|O_EXCL` 原子操作。两个实例可以同时"获取"锁，后果是两个实例同时运行。
- **修复：** 使用 `OpenOptions::new().write(true).create_new(true)`（映射到 `O_CREAT|O_EXCL`）替代 `File::create`，或使用 `fs2` / `libc` crate 的 `flock()` 进行原子文件锁。

---

### 3. 配置生成器缺少 `await`（4处）

- **类别：** Bug
- **文件：** `src/config/merger/main.ts:89, 138, 158, 182`
- **描述：** `updateExperimentalConfig(newConfig, dbCacheFilePath)` 是异步函数（内部 await `getControllerPort()` 和 `getControllerSecret()`），但在所有四个配置生成函数（`setMixedConfig`、`setTunConfig`、`setGlobalMixedConfig`、`setGlobalTunConfig`）中都未 `await`。下游的 `writeConfigFile` 可能在 store 读取完成前执行，导致 `experimental.clash_api` 和 `experimental.cache_file` 字段缺失。
- **修复：** 在4个调用点前加上 `await`：

```ts
await updateExperimentalConfig(newConfig, dbCacheFilePath);
```

---

## 🟡 MEDIUM — 建议近期修复

### 4. 端口输入每次按键都写磁盘

- **类别：** Performance
- **文件：** `src/pages/SettingsPage.tsx:194-216, 516, 533`
- **描述：** `handleProxyPortChange` / `handleApiPortChange` 在 `onChange` 中每次击键触发 `store.set + store.save + getEngineState()`。输入5位端口（如2345）会触发4次不必要的磁盘写入和引擎状态查询。对比：bypass 字段正确使用了 `onBlur`。
- **修复：** 使用 debounce（500ms）或改为 `onBlur` / Enter 按下时持久化。

---

### 5. 开关设置乐观更新无回滚

- **类别：** Code Quality
- **文件：** `src/pages/SettingsPage.tsx:149-161`
- **描述：** `handleAutoStartChange` 在 await 异步操作前就更新了 UI 状态（`setAutoStart(checked)`）。如果 OS 级自启动注册失败（如权限被拒），错误被捕获并记录日志，但 UI 状态不会回滚，显示错误的开关状态。同样的问题存在于 `handleHideOnLaunchChange`、`handleMinimizeToTrayChange`、`handleTunStackChange`。
- **修复：** catch 块中回滚状态 `setAutoStart(!checked)`。

---

### 6. 日志写入静默吞错

- **类别：** Code Quality
- **文件：** `src-tauri/src/core/log.rs:97`
- **描述：** `let _ = writeln!(file, "{}", trimmed)` 丢弃所有 I/O 错误。如果日志文件描述符失效（如磁盘满），所有后续日志静默丢失，且 writer `Option` 不会被置为 `None`，导致持续无效写入。
- **修复：** 连续失败 N 次后记录警告，或将 `Option<File>` 设为 `None` 终止后续写入尝试。

---

### 7. Windows `pid_is_alive` 始终返回 `true`

- **类别：** Bug
- **文件：** `src-tauri/src/core/process.rs:14-17`
- **描述：** 非 Unix 的 fallback 实现无条件返回 `true`，导致 `pm_snapshot()` 中进程快照的 `alive` 字段始终为 `true`。目前所有消费者仅在日志字符串中使用该值（不控制流程），但有潜在风险。
- **修复：** 使用 `windows` crate 的 `OpenProcess` + `GetExitCodeProcess` 实现，或至少在 child handle drop 时手动跟踪 alive 状态。

---

### 8. 配置生成函数大量重复代码

- **类别：** Code Quality
- **文件：** `src/config/merger/main.ts`（setMixedConfig、setTunConfig、setGlobalMixedConfig、setGlobalTunConfig）
- **描述：** 四个函数包含近 60 行几乎相同的管道逻辑，仅在模式字符串、缓存文件名、自定义规则注入（仅非 global）和 TUN 入站配置（仅 tun）上有差异。TUN 模式中调用了可能无效的 `configureMixedInbound`（疑似复制粘贴残留）。管道变更需在四个函数中同步修改。
- **修复：** 提取共享 `buildConfig(mode, identifier)` 管道，通过模式标志区分行为。

---

### 9. 版本号硬编码漂移

- **类别：** Bug
- **文件：** `src/types/definition.ts:30` + `src/pages/SettingsPage.tsx:332`
- **描述：** `APP_VERSION` 硬编码为 `'0.2.0'`，而 `package.json`、`Cargo.toml`、`tauri.conf.json` 均为 `'0.2.1'`。SettingsPage 中还有第二处独立硬编码的 `'v0.2.0'`。`buildSubscriptionUserAgent()` 向订阅服务器发送过期版本。
- **修复：** 立即更新为 `'0.2.1'`。长期通过 Vite `define` 配置或 Tauri `getAppVersion` API 自动获取版本号，防止未来漂移。

---

## 🟢 LOW — 可择机优化

### 10. `refresh()` 无并发去重

- **类别：** Code Quality
- **文件：** `src/contexts/SubscriptionContext.tsx:131-159`
- **描述：** `refresh` 函数执行异步 DB 查询和状态更新，无任何去重守卫。实际风险低，因为 `refresh` 仅从用户操作触发且调用链是顺序 await。
- **修复：** 添加 loading guard 或 debounce。

---

### 11. 主题用 `localStorage` 而非共享 Store

- **类别：** Code Quality
- **文件：** `src/contexts/ThemeContext.tsx:15, 22`
- **描述：** 主题偏好通过 `localStorage` 持久化，而其他所有设置通过 `@tauri-apps/plugin-store`（`LazyStore`）管理。主题不会在 Tauri store 重置时被清除，且 Rust 侧无法访问。
- **修复：** 使用 `single/store.ts` 的共享 `LazyStore`。

---

### 12. Windows exit code 1 静默转为成功

- **类别：** Code Quality
- **文件：** `src-tauri/src/core/monitor.rs:69-86`
- **描述：** 当 `is_stopping` 为 `true` 且退出码为 `1` 时，静默重映射为 `0`。Windows 上 `TerminateProcess` 常返回1，但此条件过于宽泛，无法区分正常终止和清理期间崩溃。
- **修复：** 添加注释说明原因。考虑使用哨兵退出码或检查进程是否由 `child.kill()` 终止。

---

### 13. GeoIP 查询使用明文 HTTP

- **类别：** Security
- **文件：** `src-tauri/src/commands/network.rs:255`
- **描述：** 主 GeoIP 查询使用 `http://ip-api.com` 明文传输。响应可被中间人拦截或篡改。备用查询（第304行）正确使用 HTTPS。
- **修复：** 使用 HTTPS 的 ip-api.com 或将 HTTPS 备用服务提升为主查询。

---

### 14. `ping_tcp` 允许任意 TCP 连接

- **类别：** Security
- **文件：** `src-tauri/src/commands/network.rs:209-224`
- **描述：** `ping_tcp` 命令接受任意 host 和 port 参数，零验证直接 `TcpStream::connect`。若 webview 内容被攻破（如订阅数据 XSS），可被用于端口扫描。同文件的 `is_private_ip` 函数是死代码。
- **修复：** 限制 host 参数为预期的代理节点地址。移除或复用 `is_private_ip` 死代码。

---

### 15. 白名单哈希文件无签名验证

- **类别：** Security
- **文件：** `src-tauri/src/commands/whitelist.rs:9-15`
- **描述：** 远程白名单通过 HTTPS 获取明文 SHA256 哈希列表，无额外签名验证。若远程 URL 被攻破，攻击者可注入任意主机名哈希。影响范围限于 CDN 加速器回退。
- **修复：** 对白名单文件签名并验签，或实施证书固定。

---

### 16. bypass 列表 CIDR 冗余

- **类别：** Architecture
- **文件：** `src-tauri/src/engine/common/bypass.rs:11, 15`
- **描述：** macOS 和 Linux 的 `DEFAULT_BYPASS` 都包含 `'172.29.0.0/16'`，但已被 `'172.16.0.0/12'`（覆盖 172.16.0.0–172.31.255.255）完全覆盖。无害但表明是从旧版本复制粘贴而来。
- **修复：** 移除冗余的 `'172.29.0.0/16'` 条目。

---

### 17. DNS 基准测试启动时跑两次

- **类别：** Performance
- **文件：** `src-tauri/src/commands/dns.rs:320-379`
- **描述：** `get_optimal_local_dns_server` 和 `get_optimal_global_dns_server` 都调用 `get_best_dns_per_region()`（29 个 DNS 服务器 UDP 探测）。内存缓存被 `running` 状态门控，启动配置准备阶段 `running == false`，缓存无法命中，基准测试顺序跑两次。
- **修复：** 缓存完整的 `(best_cn, best_global)` 元组，使第二次调用直接读取缓存。

---

## 📋 整体建议

### 1. 提升 async/await 纪律

- 前端启用 `@typescript-eslint/no-floating-promises` lint 规则
- Rust 端启用 `clippy::let_underscore_must_use` 或类似 lint
- 本次审查中多处问题源于未 await 的异步调用

### 2. 统一状态持久化

所有用户偏好（含主题）应统一通过 `LazyStore` 持久化，消除 `localStorage` 与 Tauri Store 的双轨问题。

### 3. 重构配置管道

四个重复的配置生成函数合并为一个参数化管道，消除约 60 行重复代码和复制粘贴残留。

### 4. 建立统一错误处理策略

I/O 操作和 OS 级副作用不应静默失败。建议分类：
- 必须传播的错误（配置写入、进程管理）
- 可降级但需记录的错误（日志写入、DNS 探测）
- 可忽略的错误（UI 状态回退）

### 5. 关键路径平台代码补全

- Windows `pid_is_alive` 和 Unix 单实例锁需在生产发布前修复
- 补充平台特定的集成测试覆盖

---

## 问题汇总

| # | 严重性 | 标题 | 文件 | 类别 |
|---|--------|------|------|------|
| 1 | 🔴 HIGH | Tauri 事件监听器泄漏 + 竞态 | `src/hooks/useEngineState.ts` | Bug |
| 2 | 🔴 HIGH | Unix 单实例锁 TOCTOU 竞态 | `src-tauri/src/app/single_instance.rs` | Bug |
| 3 | 🔴 HIGH | 配置生成器缺少 await（4处） | `src/config/merger/main.ts` | Bug |
| 4 | 🟡 MEDIUM | 端口输入每次按键都写磁盘 | `src/pages/SettingsPage.tsx` | Performance |
| 5 | 🟡 MEDIUM | 开关乐观更新无回滚 | `src/pages/SettingsPage.tsx` | Code Quality |
| 6 | 🟡 MEDIUM | 日志写入静默吞错 | `src-tauri/src/core/log.rs` | Code Quality |
| 7 | 🟡 MEDIUM | Windows pid_is_alive 始终 true | `src-tauri/src/core/process.rs` | Bug |
| 8 | 🟡 MEDIUM | 配置生成函数大量重复 | `src/config/merger/main.ts` | Code Quality |
| 9 | 🟡 MEDIUM | 版本号硬编码漂移 | `src/types/definition.ts` | Bug |
| 10 | 🟢 LOW | refresh() 无并发去重 | `src/contexts/SubscriptionContext.tsx` | Code Quality |
| 11 | 🟢 LOW | 主题用 localStorage 而非共享 Store | `src/contexts/ThemeContext.tsx` | Code Quality |
| 12 | 🟢 LOW | Windows exit code 1 静默转成功 | `src-tauri/src/core/monitor.rs` | Code Quality |
| 13 | 🟢 LOW | GeoIP 查询使用明文 HTTP | `src-tauri/src/commands/network.rs` | Security |
| 14 | 🟢 LOW | ping_tcp 允许任意 TCP 连接 | `src-tauri/src/commands/network.rs` | Security |
| 15 | 🟢 LOW | 白名单哈希无签名验证 | `src-tauri/src/commands/whitelist.rs` | Security |
| 16 | 🟢 LOW | bypass 列表 CIDR 冗余 | `src-tauri/src/engine/common/bypass.rs` | Architecture |
| 17 | 🟢 LOW | DNS 基准测试启动跑两次 | `src-tauri/src/commands/dns.rs` | Performance |
