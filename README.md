# AureStream（Tauri + React + TypeScript）

本项目使用 **pnpm** 管理前端依赖与脚本。仓库根目录已有 `pnpm-lock.yaml`，请勿提交 `package-lock.json`。

## 环境要求

- [Node.js](https://nodejs.org/)（建议 LTS）
- [pnpm](https://pnpm.io/installation)（建议启用 [Corepack](https://nodejs.org/api/corepack.html)，以自动使用 `package.json` 中的 `packageManager` 字段指定版本）
- [Rust](https://rustup.rs/)（构建 Tauri）

## 常用命令

```bash
pnpm install          # 安装依赖
pnpm dev              # 启动 Vite 开发服务器
pnpm build            # 前端生产构建（tsc + vite build）
pnpm tauri dev        # Tauri 桌面开发
pnpm tauri build      # Tauri 桌面打包
```

### shadcn/ui 等 CLI

与官方文档中的 `npx shadcn@latest` 等价，在本仓库请使用：

```bash
pnpm dlx shadcn@latest <子命令>
```

## 推荐 IDE

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
