# 故障排查

开发与日常使用中常见问题的诊断与解决思路。

## 1. IPv6 连接问题 (Windows connectex error)
- **现象**: 在存在 IPv6 本地接口地址但上游网络无法实际路由 IPv6 流量的环境中，连接报错。
- **原因**: 操作系统在双栈开启时，可能优先尝试通过 direct 出站绑定 IPv6 地址，导致网络不可达。
- **解决方案**: 
  - 通过 DNS Hijack 在路由规则中强行插入 `{"action": "resolve", "strategy": "prefer_ipv4"}`。
  - 在 `direct` 出站节点配置 `domain_strategy: "prefer_ipv4"` 覆盖默认行为。

## 2. 端口冲突
- 默认代理端口: **2345**，默认控制 API 端口: **9191**。
- `prestart.rs` 包含端口冲突预检逻辑。如果存在进程僵死，Core Engine 会在发起 `start()` 阶段主动尝试杀死占用混淆端口的残留进程。

## 3. TUN 模式报错
- **Windows**: 需要验证 `AureStreamTunService` (SCM 服务) 是否已正常安装。可在 设置 → 系统与服务 页面手动触发布署。
- **macOS Helper / SMJobBless**:
  - 错误 `CFErrorDomainLaunchd error 4` 表示**主程序与 Helper 代码签名不匹配**（非用户取消授权）。
  - **本地 release 包**：构建后执行 `pnpm sign-macos-bundle path/to/aurestream.app`（或 `scripts/post-sign-macos-bundle.sh`），再在设置页安装辅助服务。
  - **勿用 `pnpm tauri dev` 测 TUN**：开发模式 .app 结构/签名不完整，SMJobBless 会失败。
  - **设置页显示「未安装」但系统里仍有 Helper**：旧版检测仅依赖 XPC `ping`；签名不一致时 ping 失败会被误判。新版会检测 `/Library/PrivilegedHelperTools/` 下文件并显示「已安装但通信异常」，可在设置页卸载（XPC 失败时走管理员密码清理）。
  - **CI/未签名构建**：未配置 `APPLE_SIGNING_IDENTITY` secret 时使用 ad-hoc（`-`）签名；workflow 打包后会再深度签 `.app`。勿向 tauri-action 传入空的 `APPLE_SIGNING_IDENTITY`，否则会覆盖 `-` 导致 codesign 失败。
  - **Developer ID 发布**：Helper 与 App 须同一证书；用 `scripts/sync-smjobbless-reqs.ts` 同步 `SMPrivilegedExecutables` / `SMAuthorizedClients` 后重新 `pnpm pre-bundle && pnpm tauri build`。
- **Linux**: 确认 deb/rpm 已安装 `aurestream-tun-helper` 与 polkit 策略；卸载服务使用设置页或 `pkexec /usr/lib/AureStream/aurestream-tun-helper uninstall`。
- **Stack 选项**（仅 TUN 模式，Linux 强制 system）:
  - 默认 `system`：性能最佳。
  - UDP 漏连/环路：尝试 `gvisor`（全用户态栈）或 `mixed`（TCP system + UDP gVisor）。
  - 修改后需等待 config-sync 重写 `config.json`；运行中会热重载。

## 4. 系统代理未生效 / 退出未清理
- 底层行为由 `aurestream-plugin-proxy` 处理：Windows 写注册表，macOS 调用 SystemConfiguration，Linux 修改 gsettings。
- 应用非正常退出时，由 Rust 侧的 `cleanup_on_shutdown()` 处理清理逻辑。
- 在 Windows 环境，AureStream 已经集成了对 UWP 应用的自动环回免除 (Loopback Exemption)。

## 5. 订阅更新失败
- 更新逻辑底层使用 `fetch_config`，订阅抓取走系统解析，不再做公共 DNS 测速或手写 A 记录解析。
- 连接配置中的 DNS 默认使用 `config-template.jsonc` 里的模板值；只有用户显式配置 DNS 时才覆盖模板。
- 也可以通过在订阅地址栏填入本地协议如 `file:///D:/my-config.yaml` 导入本地配置。

## 6. 配置生成问题
- 配置文件由前端在**输入变化时**预合并（`config-sync`），连接时仅校验 cacheKey 是否新鲜。
- 拼装流程：读取模板 → 按路由/TUN 选档裁剪 → 注入 TUN stack/端口/DNS → 合并订阅节点 → 写入 `config.json`。
- 语法错误在 `aurestream-core check` 阶段拦截；预合并成功后会 `mark_config_verified` 跳过重复 check。
- 控制台可搜索 `[connection-config]`、`[config-sync]`、`当前 TUN Stack:` 排查合并是否执行。

## 6.1 连接偏慢
- **macOS 系统代理**：`networksetup` 设/清代理约 0.8–1s，属系统 API 耗时。
- **点击连接**：确认未在连接时重复 merge（应看到 `merge skipped (inputs unchanged)`）。
- **断开等待**：SystemProxy 停止已改为端口释放轮询，日志关键字 `[stop] proxy port`。

## 7. 日志收集与调试
- 应用日志：macOS `~/Library/Logs/com.root.aurestream/aurestream.log`；支持毫秒级时间戳。
- 内核 sidecar 日志：AppData 目录，最大 50MB 轮转；`read_logs` 命令拉取。
- 开发：`pnpm tauri dev`；前端 perf 埋点关键字 `connect.`、`hot-reload.`、`config-sync.`。
- 测试环境可利用 `src/data/mock.ts` 返回假数据。
