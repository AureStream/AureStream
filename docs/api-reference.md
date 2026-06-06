# API 参考

AureStream 的 API 面向三个主要层次：Tauri FFI 接口、sing-box 进程内控制流以及前端内部包装器。

## 1. Tauri Commands

在 Rust 后端注册并通过 `@tauri-apps/api` 调用的系统级指令。

### 核心引擎
- `start(path, mode)`: 启动代理内核。
- `stop()`: 停止代理内核。
- `get_engine_state()`: 返回序列化的状态机信息。
- `clear_engine_error()`: 清除错误状态并重置为 Idle。
- `reload_config()`: 热重载当前配置。

### 引擎探测与服务
- `engine_ensure_installed()`: 安装 Windows TUN 驱动服务。
- `engine_uninstall_service()`: 卸载特权服务。Windows 调用 `tun-service uninstall`；macOS 通过 XPC 让 Helper 自卸载（`launchctl bootout` + 删除 blessed 文件，对齐 OneBox 测试脚本流程）；Linux 通过 `pkexec /usr/lib/AureStream/aurestream-tun-helper uninstall`（helper 脚本见 `src-tauri/resources/linux/aurestream-tun-helper`，随 deb/rpm 安装）。
- `engine_probe()`: 探测内核状态。

### Shell 与生命周期
- `version()`, `get_app_version()`: 获取内核与 UI 版本。
- `read_logs()`: 读取应用运行日志。
- `open_devtools()`, `open_directory()`: 操作系统关联工具调用。
- `quit()`, `restart()`: 控制 Tauri 宿主程序进程。
- `get_pending_deep_link()`: 获取唤醒时附加的 URI 参数。

### 网络
- `ping_tcp()`: 节点 TCP 连通性/延迟检测。
- `get_geoip_info()`: 获取当前公网 IP 及地理位置信息。
- `fetch_config()`: 使用系统解析发起订阅内容抓取；连接配置中的 DNS 使用模板默认值，只有用户显式配置时才覆盖。

## 2. sing-box Clash API (REST)

通过 `src/utils/singbox-api` 直接向运行中的 sing-box 控制端口发起 HTTP 请求，避开 Tauri FFI 的序列化开销。

- **Base URL**: `http://127.0.0.1:{controller_port}`
- **Auth**: Bearer Token
- **Endpoints**:
  - `GET /proxies/ExitGateway`: 抓取出口策略组下的所有节点状态。
  - `PUT /proxies/ExitGateway`: 变更策略组选择的节点。
  - `GET /proxies/{name}/delay?url=&timeout=`: 发起实时延迟测试。
  - `GET /traffic`: 获取基于 NDJSON 格式的实时流量推流。

## 3. Store 键名常数配置

定义在 `definition.ts` 中，映射 `settings.json`：
- `proxy_port_key` (默认: 2345)
- `singbox_api_port_key` (默认: 9191)
- `tun_auto_route_key`, `tun_stack_key`, `tun_mtu_key`
- `proxy_bypass_key` (系统代理直连绕过列表)

## 4. Deep Link 规范
- **协议 Scheme**: `aurestream://`
- **导入订阅格式**: `aurestream://config?data={url_encoded_subscription_url}&apply=1`
