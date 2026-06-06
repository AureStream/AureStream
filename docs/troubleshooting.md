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
- **Stack 选项**: 默认采用 `system` 协议栈。如果遇到网络环路或 UDP 漏连问题，可尝试切换为 `gvisor`。

## 4. 系统代理未生效 / 退出未清理
- 底层行为由 `sysproxy-rs` 处理：Windows 写注册表，macOS 调用 SystemConfiguration，Linux 修改 gsettings。
- 应用非正常退出时，由 Rust 侧的 `cleanup_on_shutdown()` 处理清理逻辑。
- 在 Windows 环境，AureStream 已经集成了对 UWP 应用的自动环回免除 (Loopback Exemption)。

## 5. 订阅更新失败
- 更新逻辑底层使用 `fetch_config`，订阅抓取走系统解析，不再做公共 DNS 测速或手写 A 记录解析。
- 连接配置中的 DNS 默认使用 `config-template.jsonc` 里的模板值；只有用户显式配置 DNS 时才覆盖模板。
- 也可以通过在订阅地址栏填入本地协议如 `file:///D:/my-config.yaml` 导入本地配置。

## 6. 配置生成问题
- 配置文件由前端拼装完成后传递给内核。拼装流程：读取模板 → 基于模式裁剪（Rule/Global/TUN/Mixed） → 注入规则 → 合并订阅节点 → 生成。
- 如果发生语法错误，可在 `aurestream-core check -c config.json` 阶段被捕获拦截，并在 UI 上抛出 Error。

## 7. 日志收集与调试
- 内核进程日志存储在 AppData 目录下，最大限制 50MB 自动轮转，可通过 UI 或 Tauri Command `read_logs` 拉取分析。
- 启动程序可通过 `pnpm tauri dev` 启用带前端控制台的热更新调试。
- 测试环境可以利用 `src/data/mock.ts` 返回假数据以规避网络条件依赖。
