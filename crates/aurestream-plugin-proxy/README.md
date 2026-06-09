# onebox-sysproxy-rs

跨平台系统代理配置工具与库。支持 Windows、macOS 和 Linux（GNOME/KDE）。

## 特性

| 平台 | 实现方式 | 特点 |
|---|---|---|
| **Windows** | WinINet API + RAS 枚举 | 三层通知（设置→通知→刷新）；枚举所有拨号/VPN 连接逐一设置；`INTERNET_PER_CONN_FLAGS_UI` 兼容 Win7+，自动 fallback 旧版；支持 UWP 应用 loopback 代理豁免管理 |
| **macOS** | `networksetup` 命令 | 自动检测活跃网络服务；支持 HTTP/HTTPS/SOCKS 代理 |
| **Linux** | `gsettings` / `kreadconfig` | 同时支持 GNOME 和 KDE 桌面环境 |

## 快速开始

### 构建

```bash
# 构建 release 二进制（推荐）
make

# 构建 debug 二进制
make build-debug

# 安装到 ~/.cargo/bin
make install
```

### 使用

```bash
# 查看帮助
sysproxy --help

# 查询当前代理设置
sysproxy query

# 设置全局 HTTP 代理
sysproxy global 127.0.0.1:7890

# 设置代理 + 自定义绕过列表（macOS/Linux 用逗号分隔）
sysproxy global 127.0.0.1:7890 "localhost,127.0.0.1,192.168.0.0/16,10.0.0.0/8"

# 设置代理 + 自定义绕过列表（Windows 用分号分隔）
sysproxy global 127.0.0.1:7890 "localhost;127.*;10.*;192.168.*;<local>"

# 设置 PAC 自动代理
sysproxy pac http://127.0.0.1:1080/proxy.pac

# 关闭代理（恢复直连）
sysproxy off

# 导出 UWP 豁免列表到 uwp_exemption.json（仅 Windows）
sysproxy uwp-get

# 从 uwp_exemption.json 应用 UWP 豁免列表（仅 Windows）
sysproxy uwp-set
```

## 命令行参考

### `sysproxy query`

查询并显示当前系统代理和 PAC 自动代理设置。

输出示例：
```
=== System Proxy ===
  Enabled : true
  Server  : 127.0.0.1:7890
  Bypass  : localhost;127.*;<local>

=== Auto Proxy (PAC) ===
  Enabled : false
  URL     :
```

### `sysproxy global <server> [bypass]`

设置全局 HTTP 代理。

| 参数 | 说明 |
|---|---|
| `<server>` | 代理服务器地址，格式 `host:port`（如 `127.0.0.1:7890`） |
| `[bypass]` | 可选。代理绕过列表。Windows 使用分号 `;` 分隔，macOS/Linux 使用逗号 `,` 分隔 |

**绕过列表格式说明：**

| 平台 | 分隔符 | 通配符 | 示例 |
|---|---|---|---|
| Windows | `;` | `*`（如 `127.*`） | `localhost;127.*;192.168.*;<local>` |
| macOS | `,` | CIDR 或域名 | `localhost,127.0.0.1,192.168.0.0/16,*.local` |
| Linux | `,` | CIDR 或域名 | `localhost,127.0.0.1,::1` |

### `sysproxy pac <url>`

设置 PAC 自动代理 URL。

| 参数 | 说明 |
|---|---|
| `<url>` | PAC 文件 URL（如 `http://127.0.0.1:1080/proxy.pac`） |

### `sysproxy off`

关闭系统代理，恢复为直连模式。

### `sysproxy uwp-get`（仅 Windows）

将所有已安装的 UWP 应用容器及其当前豁免状态导出到当前目录的 `uwp_exemption.json`。

输出示例：
```json
[
  {
    "sid": "S-1-15-2-...",
    "name": "microsoft.microsoftedge_8wekyb3d8bbwe",
    "display_name": "Microsoft Edge",
    "exempted": false
  },
  {
    "sid": "S-1-15-2-...",
    "name": "microsoft.windowscommunicationsapps_8wekyb3d8bbwe",
    "display_name": "Mail and Calendar",
    "exempted": true
  }
]
```

### `sysproxy uwp-set`（仅 Windows）

从当前目录的 `uwp_exemption.json` 读取列表，将 `"exempted": true` 的条目设置为系统 loopback 代理豁免。

典型工作流：

```bash
sysproxy uwp-get          # 导出完整列表
# 编辑 uwp_exemption.json，将需要豁免的应用改为 "exempted": true
sysproxy uwp-set          # 应用
```

> **说明：** UWP 应用默认被沙箱隔离，无法连接 loopback 地址（如 `127.0.0.1`）。loopback 豁免允许这些应用通过本地代理客户端访问网络。

### `sysproxy set <flags> [server] [bypass] [pac_url]`

底层命令，通过标志位精确控制代理类型。适用于高级场景。

| 参数 | 说明 |
|---|---|
| `<flags>` | 代理类型标志位（1-15），参见下表 |
| `[server]` | 代理服务器地址（`-` 表示保持现有值） |
| `[bypass]` | 绕过列表（`-` 表示保持现有值） |
| `[pac_url]` | PAC URL（`-` 表示保持现有值） |

**标志位说明：**

| 位值 | 含义 |
|---|---|
| `1` | `PROXY_TYPE_DIRECT` — 允许直连 |
| `2` | `PROXY_TYPE_PROXY` — 启用 HTTP 代理 |
| `4` | `PROXY_TYPE_AUTO_PROXY_URL` — 启用 PAC 自动代理 |
| `8` | `PROXY_TYPE_AUTO_DETECT` — 启用 WPAD 自动检测 |

标志可组合使用。常见组合：

| 组合 | flags 值 | 含义 |
|---|---|---|
| 仅直连 | `1` | 关闭所有代理 |
| 代理 + 直连 | `3` | 启用 HTTP 代理，允许绕过 |
| PAC + 直连 | `5` | 使用 PAC 自动代理 |
| PAC + 自动检测 + 直连 | `13` | PAC + WPAD + 直连 |

**示例：**

```bash
# 启用代理+直连 (flags=3)，设置服务器和绕过列表
sysproxy set 3 127.0.0.1:7890 "localhost;127.*"

# 仅关闭代理 (flags=1)
sysproxy set 1

# 设置 PAC+直连 (flags=5)，跳过 server 和 bypass，只设 PAC URL
sysproxy set 5 - - http://example.com/proxy.pac
```

## 作为库使用

在 `Cargo.toml` 中添加依赖：

```toml
[dependencies]
onebox-sysproxy-rs = { git = "https://github.com/OneOhCloud/onebox-sysproxy-rs" }
```

### API 示例

```rust
use onebox_sysproxy_rs::{Sysproxy, Autoproxy};

// 查询当前代理
let proxy = Sysproxy::get_system_proxy().unwrap();
println!("Proxy enabled: {}, server: {}:{}", proxy.enable, proxy.host, proxy.port);

// 设置代理
let proxy = Sysproxy {
    enable: true,
    host: "127.0.0.1".to_string(),
    port: 7890,
    bypass: "localhost;127.*".to_string(),
};
proxy.set_system_proxy().unwrap();

// 关闭代理
let proxy = Sysproxy { enable: false, ..Default::default() };
proxy.set_system_proxy().unwrap();

// PAC 自动代理
let auto = Autoproxy {
    enable: true,
    url: "http://127.0.0.1:1080/proxy.pac".to_string(),
};
auto.set_auto_proxy().unwrap();
```

### 公共类型

```rust
/// 系统 HTTP/SOCKS 代理配置
pub struct Sysproxy {
    pub enable: bool,     // 是否启用
    pub host: String,     // 代理主机
    pub port: u16,        // 代理端口
    pub bypass: String,   // 绕过列表
}

/// PAC 自动代理配置
pub struct Autoproxy {
    pub enable: bool,     // 是否启用
    pub url: String,      // PAC 文件 URL
}

/// UWP 应用容器（仅 Windows）
#[cfg(target_os = "windows")]
pub struct AppContainer {
    pub sid: String,           // AppContainer SID（S-1-15-2-…）
    pub name: String,          // 包名（如 microsoft.microsoftedge_8wekyb3d8bbwe）
    pub display_name: String,  // 显示名称
    pub exempted: bool,        // 是否在 loopback 代理豁免列表中
}
```

### 方法

| 方法 | 平台 | 说明 |
|---|---|---|
| `Sysproxy::get_system_proxy()` | 全平台 | 获取当前系统代理设置 |
| `Sysproxy::set_system_proxy(&self)` | 全平台 | 设置系统代理 |
| `Sysproxy::is_support()` | 全平台 | 当前平台是否支持 |
| `Autoproxy::get_auto_proxy()` | 全平台 | 获取当前 PAC 设置 |
| `Autoproxy::set_auto_proxy(&self)` | 全平台 | 设置 PAC 自动代理 |
| `Autoproxy::is_support()` | 全平台 | 当前平台是否支持 |
| `AppContainer::get_exemption()` | Windows | 获取所有 UWP 应用及当前豁免状态 |
| `AppContainer::set_exemption(&[String])` | Windows | 按 SID 列表设置 loopback 豁免，返回更新后的完整列表 |

### UWP 豁免 API 示例（仅 Windows）

```rust
use onebox_sysproxy_rs::AppContainer;

// 获取所有 UWP 应用及豁免状态
let apps = AppContainer::get_exemption().unwrap();
for app in &apps {
    println!("[{}] {} ({})", if app.exempted { "x" } else { " " }, app.display_name, app.sid);
}

// 将指定 SID 设为豁免
let sids = vec!["S-1-15-2-...".to_string()];
let updated = AppContainer::set_exemption(&sids).unwrap();
```

## Makefile 命令

```bash
make              # 构建 release 二进制
make build-debug  # 构建 debug 二进制
make check        # 类型检查
make test         # 运行测试
make test-verbose # 运行测试（显示输出）
make fmt          # 格式化代码
make lint         # Clippy 检查
make doc          # 生成并打开文档
make install      # 安装到 ~/.cargo/bin
make uninstall    # 卸载
make clean        # 清理构建产物
make help         # 显示帮助
```

### 交叉编译

```bash
# 为 Windows 交叉编译
make TARGET=x86_64-pc-windows-msvc

# 为 Apple Silicon 编译
make TARGET=aarch64-apple-darwin

# 为 Linux x86_64 编译
make TARGET=x86_64-unknown-linux-gnu
```

## 环境变量

| 变量 | 说明 |
|---|---|
| `RUST_LOG` | 日志级别（`error`, `warn`, `info`, `debug`, `trace`）。设置 `RUST_LOG=debug` 可显示调试日志 |

## 项目结构

```
src/
├── lib.rs       # 公共接口（Sysproxy, Autoproxy, AppContainer, Error）
├── main.rs      # CLI 二进制入口
├── windows.rs   # Windows 实现（WinINet + RAS + UWP loopback 豁免）
├── macos.rs     # macOS 实现（networksetup）
├── linux.rs     # Linux 实现（gsettings / kreadconfig）
└── utils.rs     # 工具函数（CIDR → wildcard 转换）
```

## 协议

MIT
