## AureStream v0.1.0

首个公开发布版本 — 统一代理运行时平台，基于 Mihomo 内核，支持多协议、多订阅、智能路由。

### 下载

| 平台 | 文件 | 说明 |
|------|------|------|
| Windows x64 | `AureStream_0.1.0_x64-setup.exe` | 安装版（需管理员权限） |
| Windows x64 | `AureStream_0.1.0_windows_x64_portable.zip` | 便携版（解压即用） |
| macOS (Apple Silicon) | `AureStream_0.1.0_aarch64.dmg` | M1/M2/M3/M4 芯片 |
| macOS (Intel) | `AureStream_0.1.0_x64.dmg` | Intel 芯片 |
| Linux x64 | `AureStream_0.1.0_amd64.deb` | Debian / Ubuntu |
| Linux x64 | `AureStream_0.1.0.x86_64.rpm` | Fedora / RHEL / openSUSE |
| Linux x64 | `AureStream_0.1.0.AppImage` | 通用（需 libfuse2） |

> Windows 便携版解压后包含主程序和 Mihomo 内核，双击 `AureStream.exe` 即可运行，无需安装。

### 主要特性

- **多协议支持** — VMess、VLESS、Shadowsocks、Trojan、TUIC、Hysteria2、SOCKS5、HTTP
- **订阅管理** — Clash YAML / V2Ray Base64 格式自动识别，支持批量导入和自动更新
- **两阶段解析引擎** — FormatParser → RawProxyNode → ProtocolParser → Endpoint，架构清晰可扩展
- **三层缓存策略** — 原始数据 / 解析结果 / 端点数据分层缓存，订阅解析失败时自动逐层恢复
- **智能路由** — 规则模式 / 全局代理 / 直连三种模式
- **系统代理** — 自动设置 Windows / macOS / Linux (GNOME) 系统代理，连接时自动开启，断开时自动清除
- **延迟测试** — 单节点 / 批量测速，自动选择最优节点
- **流量监控** — 实时上下行速度显示
- **SQLite 持久化** — 订阅、节点、配置全部本地存储
- **托盘模式** — 关闭窗口后最小化到系统托盘，后台运行

### 技术栈

- Tauri 2 + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui
- Rust 后端 + SQLite (sqlx) + Mihomo 内核
- 玻璃拟态设计语言，支持亮色/暗色主题

### 平台说明

- **macOS**：首次启动可能提示"无法验证开发者"，请在「系统设置 → 隐私与安全性」中允许运行，或终端执行 `xattr -cr /Applications/AureStream.app`
- **Linux**：AppImage 需要 `libfuse2`，安装命令：`sudo apt install libfuse2`
- **Windows**：需要 WebView2 运行时（Windows 10/11 通常已预装）
