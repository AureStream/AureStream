# Changelog

## v0.1.0 (2026-05-18)

首个公开发布版本。

### 核心功能

- **多协议代理支持**：VMess、VLESS、Shadowsocks、Trojan、TUIC、Hysteria2、SOCKS5、HTTP
- **订阅管理**：支持 Clash YAML 和 V2Ray Base64 两种格式自动识别，批量导入订阅链接
- **两阶段解析引擎**：FormatParser → RawProxyNode → ProtocolParser → Endpoint，架构清晰可扩展
- **智能路由**：规则模式 / 全局代理 / 直连三种模式切换
- **系统代理**：自动设置 Windows / macOS / Linux (GNOME) 系统代理，连接时自动开启，断开时自动清除
- **延迟测试**：单节点 / 批量测速，自动选择最优节点
- **流量监控**：实时上下行速度显示
- **SQLite 持久化**：订阅、节点、配置全部本地存储，三层缓存策略保障数据可靠性
- **托盘模式**：关闭窗口后最小化到系统托盘，后台运行

### 技术架构

- **前端**：React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui，玻璃拟态设计语言
- **后端**：Rust (Tauri 2.0) + SQLite (sqlx)
- **代理内核**：Mihomo 作为 sidecar 进程运行
- **状态管理**：RuntimeManager 统一管理 5 个子模块（StateMachine、CoreManager、ProxyManager、SessionManager、EventBus）
- **事件总线**：双通道 EventBus（控制/遥测）实现模块解耦

### 平台支持

| 平台 | 产物 |
|------|------|
| Windows x64 | 安装版 (NSIS exe) + 便携版 (zip) |
| macOS (Apple Silicon) | dmg |
| macOS (Intel) | dmg |
| Linux x64 | deb / rpm / AppImage |
