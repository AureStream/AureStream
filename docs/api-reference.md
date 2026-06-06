# API 参考

AureStream 的 API 面向三个主要层次：Tauri FFI 接口、sing-box 进程内控制流以及前端内部包装器。

## 1. Tauri Commands

在 Rust 后端注册（`src-tauri/src/lib.rs`），通过 `@tauri-apps/api/core` 的 `invoke()` 调用。

### 核心引擎
| 命令 | 说明 |
|------|------|
| `start(path, mode)` | 启动 sing-box 侧车；`mode` 为 `SystemProxy` 或 `IntoProxy` |
| `stop()` | 停止引擎，轮询等待端口释放 |
| `get_engine_state()` | 返回状态机 JSON |
| `clear_engine_error()` | 清除 Failed，回到 Idle |
| `reload_config()` | 热重载当前 `config.json` |
| `mark_config_verified({ configPath })` | 标记配置已通过 check，下次 start 可跳过重复校验 |

### 引擎探测与服务
| 命令 | 说明 |
|------|------|
| `engine_ensure_installed()` | 安装 Windows TUN 服务 / 检查 macOS Helper |
| `engine_uninstall_service()` | 卸载特权服务（Windows SCM / macOS XPC 自卸载 / Linux pkexec helper） |
| `engine_probe()` | 探测内核/服务安装状态 |

### Shell 与生命周期
| 命令 | 说明 |
|------|------|
| `version()` | sing-box 侧车版本 |
| `get_app_version()` | 应用 UI 版本 |
| `read_logs()` | 读取应用日志 |
| `get_config_json_path()` | 返回当前 `config.json` 绝对路径 |
| `get_app_paths()` | 返回配置目录等路径信息 |
| `open_devtools()` / `open_directory()` | 开发工具与目录 |
| `quit()` / `restart()` | 退出或重启应用 |
| `get_pending_deep_link()` | 获取唤醒时的 Deep Link URI |

### 网络与配置抓取
| 命令 | 说明 |
|------|------|
| `ping_tcp(host, port)` | 节点 TCP 延迟（未连接时 NodeSelector 测速） |
| `get_geoip_info()` | 公网 IP 与地理位置 |
| `fetch_config(url)` | 订阅内容抓取（系统 DNS 解析） |
| `verify_deep_link_url(url)` | Deep Link 导入前 URL 校验 |

### 主题
| 命令 | 说明 |
|------|------|
| `set_native_window_theme(theme)` | 同步原生窗口主题 |

## 2. sing-box Clash API (REST)

客户端：`src/utils/singbox-api/`，直连运行中的 sing-box，避免 Tauri 序列化开销。

- **Base URL**: `http://127.0.0.1:{controller_port}`
- **Auth**: Bearer Token（`controller_secret`）

| 端点 | 用途 |
|------|------|
| `GET /proxies/select` | 当前 selector 组与选中节点 |
| `PUT /proxies/select` | 切换节点 |
| `GET /proxies/{name}/delay` | 延迟测试 |
| `GET /traffic` | NDJSON 实时流量流 |

热重载后应调用 `invalidateControllerClientCache()` 刷新客户端缓存。

## 3. 前端内部 API（非 Tauri）

| 模块 | 主要导出 |
|------|----------|
| `connectEngine` | 连接前校验 + start |
| `scheduleConfigSync` / `syncActiveConnectionConfig` | 预合并调度 |
| `hotReloadConnectionConfig` / `hotReloadIfRunning` | 运行中热重载 |
| `mergeConnectionConfig` / `isConnectionConfigFresh` | 合并与缓存判断 |

## 4. Store 键名常数

定义于 `src/types/definition.ts`，映射 `settings.json`：

| 键名 | 默认/说明 |
|------|-----------|
| `proxy_port_key` | 2345 |
| `singbox_api_port_key` | 9191 |
| `tun_stack_key` | `system`（可选 `gvisor`、`mixed`） |
| `tun_auto_route_key`, `tun_mtu_key` | TUN 路由与 MTU |
| `proxy_bypass_key` | 系统代理绕过列表 |
| `ssi_store_key` | 当前活动订阅 identifier |

## 5. Deep Link 规范
- **Scheme**: `aurestream://`
- **导入订阅**: `aurestream://config?data={url_encoded_subscription_url}&apply=1`
