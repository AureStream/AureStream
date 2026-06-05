# AureStream（Tauri + React + TypeScript）

本项目使用 **pnpm** 管理前端依赖与脚本。配置模板直接采用本地 `src/config/templates/config-template.jsonc` 形式进行自维护。仓库根目录已有 `pnpm-lock.yaml`，请勿提交 `package-lock.json`。

## 环境要求

- [Node.js](https://nodejs.org/)（建议 LTS）
- [pnpm](https://pnpm.io/installation)（建议启用 [Corepack](https://nodejs.org/api/corepack.html)，以自动使用 `package.json` 中的 `packageManager` 字段指定版本）
- [Rust](https://rustup.rs/)（构建 Tauri）

## 常用命令

```bash
pnpm install                 # 安装依赖
pnpm dev                     # 启动 Vite 开发服务器
pnpm build                   # 前端生产构建（tsc + vite build）
pnpm tauri dev               # Tauri 桌面开发
pnpm run download-binaries   # 下载 sing-box 内核及规则数据库到本地
pnpm run build-tun --release # 编译并放置 Windows 专属服务组件 (Sidecar)
pnpm run prebundle           # 编译并签名 macOS 特权 Helper 组件
pnpm tauri build             # Tauri 桌面打包
```

## 桌面应用打包步骤

在本地首次打包或更新内核依赖后，请按照以下步骤进行完整打包：

### 1. 准备依赖与数据（所有平台通用）
```bash
# 安装依赖
pnpm install
# 准备内核及规则数据
pnpm run download-binaries
```

### 2. 平台专属准备工作
* **Windows**（编译高权限服务）：
  ```bash
  pnpm run build-tun --release
  ```
* **macOS**（编译并签名特权 Helper）：
  ```bash
  pnpm run prebundle
  ```
* **Linux**：
  无额外准备步骤，但请确保系统安装了打包所需的依赖开发包：
  ```bash
  sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
  ```

### 3. 执行打包命令
```bash
pnpm tauri build
```

构建生成的安装包输出位置：
* **Windows**:
  * **NSIS 安装包 (`.exe`)**: `src-tauri/target/release/bundle/nsis/`
  * **WiX 安装包 (`.msi`)**: `src-tauri/target/release/bundle/msi/`
* **macOS**:
  * **`.dmg` 安装包**: `src-tauri/target/release/bundle/dmg/`
  * **`.app` 应用**: `src-tauri/target/release/bundle/macos/`
* **Linux**:
  * **`.deb` 安装包**: `src-tauri/target/release/bundle/deb/`
  * **`.AppImage` 镜像**: `src-tauri/target/release/bundle/appimage/`

### shadcn/ui 等 CLI

与官方文档中的 `npx shadcn@latest` 等价，在本仓库请使用：

```bash
pnpm dlx shadcn@latest <子命令>
```

## 推荐 IDE

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
