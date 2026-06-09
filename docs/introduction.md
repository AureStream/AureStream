# AureStream 项目介绍与开发指南

欢迎来到 **AureStream** 开发者文档中心。本手册旨在帮助新加入的开发者快速了解 AureStream 的核心定位、目录结构、开发环境配置以及跨平台编译流程，配合系统的 [设计与架构文档](./architecture.md) 共同使用。

---

## 1. 项目简介

AureStream 是一款现代化、极简、高性能的跨平台网络代理及 VPN 客户端。

* **核心目标**：提供比传统 Clash 客户端更轻量、更安全、配置更直观的智能代理体验。
* **分流内核**：完全基于 **sing-box**，摒弃了过时的协议，原生支持 VLESS、VMess、Trojan、Shadowsocks 等主流协议，并支持高性能的 TUN 虚拟网卡接管。
* **跨平台支持**：支持 Windows、macOS 以及 Linux，界面完全统一，并深度适配了各平台的系统底层网络劫持与提权逻辑。

---

## 2. 目录结构指南

项目基于前置的 `pnpm` 统一包管理器和标准的 Cargo 工作区，目录结构如下：

```
AureStream/
├── docs/                      # 文档目录
│   ├── plan/                  # 项目规划与差距分析
│   ├── architecture.md        # 系统设计与架构详细设计文档 (Mermaid/序列图)
│   └── introduction.md        # [当前文档] 项目介绍与开发指南
├── src/                       # 前端源码 (React + Vite + TypeScript)
│   ├── components/            # 可复用组件 (主页控制台、节点列表、设置页面等)
│   ├── config/                # 配置文件生成
│   │   ├── merger/            # 动态模板合并器 (将订阅节点与模板融合成 config.json)
│   │   └── templates/         # 内置 sing-box 模板 (config-template.jsonc)
│   ├── lib/                   # config-sync、connection-flow、hot-reload、perf 等
│   ├── components/layout/     # LoadingScreen、CircularLoader 启动与加载 UI
│   ├── components/ui/         # shadcn 原语 + CountryFlag 等
│   ├── single/                # 单例管理（Store 全局设置、SQLite 数据库连接）
│   ├── types/                 # 全局 TypeScript 类型与常量定义
│   └── main.tsx               # 前端渲染入口
├── src-tauri/                 # 后端源码 (Rust 核心工程)
│   ├── binaries/              # 各平台 sing-box 侧车二进制存放路径
│   ├── capabilities/          # Tauri v2 安全权限配置文件
│   ├── src/                   # Rust 业务层
│   │   ├── app/               # App 初始化、插件注册与 SQLite 数据库迁移
│   │   ├── commands/          # Tauri API（网络、配置抓取、Shell）
│   │   ├── core/              # Tauri command 入口
│   │   └── engine/            # 引擎编排、状态机、平台实现
│   ├── resources/linux/       # Linux deb/rpm 安装/卸载脚本
│   ├── Cargo.toml             # Rust 工作区主配置文件
│   └── tauri.conf.json        # Tauri 应用打包及能力配置文件
├── crates/
│   ├── aurestream-plugin-proxy/      # 跨平台系统代理设置
│   ├── aurestream-plugin-tun/        # TUN 服务和 TUN 业务逻辑
│   └── aurestream-plugin-privilege/  # Windows/macOS/Linux 提权入口与 helper 资产
├── package.json               # 统一构建与运行脚本
└── tsconfig.json              # TypeScript 配置
```

---

## 3. 技术实现亮点

AureStream 解决了一系列桌面客户端在各平台下的核心痛点：

### 3.1 跨平台系统代理设置 (`aurestream-plugin-proxy`)
项目没有使用笨重的外部脚本，而是通过 Rust 插件实现系统代理：
* **Windows**：直接通过 FFI 绑定 WinINet API 中的 `InternetSetOptionW`，并写入 Internet Settings 注册表，在无感知的情况下完成代理全局刷新。
* **macOS**：利用 `SystemConfiguration` 动态框架直接修改活动网卡的 System Proxy 属性。
* **Linux**：适配了 GNOME 的 `gsettings` 配置，与系统环境平滑对接。

### 3.2 特权分离与安全运行
由于 TUN 网卡驱动安装、虚拟网卡 IP 绑定和系统全局 DNS 接管需要管理员特权，AureStream 采用特权分离架构以提升安全性：
* **Windows 平台**：`aurestream-plugin-privilege::windows` 通过 UAC 安装/卸载 `AureStreamTunService`，服务实现位于 `aurestream-plugin-tun`。
* **macOS 平台**：主 App 内嵌 `crates/aurestream-plugin-privilege/macos-helper/` 构建出的 Privileged Helper，通过 `SMJobBless` 安装，并通过 XPC 通信。
* **Linux 平台**：deb/rpm 安装 `aurestream-plugin-privilege/linux-helper/` 中的 pkexec helper 与 polkit 策略，运行时由 `pkexec` 发起特权操作。

### 3.3 配置预合并与热重载

连接配置在用户修改订阅、路由模式、TUN 开关、节点或网络设置时即后台合并写入 `config.json`，点击连接仅校验缓存是否新鲜。引擎运行中可通过 `reload_config` 热重载而不断开。详见 [配置合并与模板](./wiki-config-merger.md)。

### 3.4 自动看门狗机制与 DNS 恢复
针对代理客户端异常崩溃导致网络“瘫痪”（即 DNS 被改写成 127.0.0.1 但服务已死）的问题：
* 后端配置了常驻的看门狗线程。
* 任何情况下（如内核退出、应用崩溃），退出钩子（`cleanup_on_shutdown` 或 macOS 信号恢复）均会自动触发清除系统代理，还原 DNS 为系统 DHCP 原生分配地址，实现灾难自我恢复。

---

## 4. 开发与构建指南

### 4.1 前提准备
1. 安装 [Node.js](https://nodejs.org/)（推荐 v18+）。
2. 安装包管理器 `pnpm`：`npm install -g pnpm`。
3. 安装 Rust 工具链 [Rustup](https://rustup.rs/)（需支持 edition 2024）。
4. 在 Windows 下需配置 `C++ Build Tools` 或 `Visual Studio`。

### 4.2 本地运行
1. **安装依赖**：
   在项目根目录下运行：
   ```bash
   pnpm install
   ```
2. **下载内核二进制**：
   项目内置了自动拉取各平台 sing-box 侧车二进制的脚本：
   ```bash
   pnpm download-binaries
   ```
3. **启动开发调试服务器**：
   ```bash
   pnpm tauri dev
   ```

### 4.3 生产构建与打包
在对应操作系统的机器上运行以下命令，Tauri 会自动将其编译并打包为原生安装程序：
```bash
pnpm tauri build
```
打包生成的可执行文件将位于 `src-tauri/target/release/bundle/` 目录下（例如 Windows 下的 `.msi` 或 `.exe` 安装包）。

---

## 5. 后续设计规约
在向本项目提交代码时，请遵循以下开发规约：
* **状态持久化**：基础设置保存在 `settings.json`（Store）；Rust 从 Store 读取端口等运行时参数。前端通过 `config-sync` 将 Store 偏好合并进 `config.json`，不要在 `connect` 路径重复 merge。
* **Crate 边界**：系统代理放在 `aurestream-plugin-proxy`，TUN 业务/服务放在 `aurestream-plugin-tun`，提权入口和 helper 资产放在 `aurestream-plugin-privilege`。
* **多平台对齐**：修改平台引擎（如 `WindowsEngine`）功能时，需同步确认 macOS/Linux 引擎的对应钩子（如 `on_process_terminated`）是否受影响。
