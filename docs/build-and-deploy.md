# 构建与部署

## 1. 环境要求
- **Node.js**: v18+ (推荐 LTS)
- **包管理器**: pnpm 11.4.0 (推荐通过 Corepack 启用)
- **Rust**: Edition 2024 (通过 Rustup 管理)
- **平台特定要求**:
  - Windows: Visual Studio C++ Build Tools
  - Linux: `webkit2gtk`, `libxdo`, `ssl`, `appindicator`, `rsvg` 的开发包 (dev packages)

## 2. 开发环境搭建

```bash
# 安装前端与 Tauri 依赖
pnpm install

# 下载目标平台的 sing-box 预编译内核
pnpm download-binaries

# 启动开发服务器与 Tauri 调试窗口
pnpm tauri dev
```

## 3. 构建流程

打包构建桌面端应用需要执行以下完整步骤：

1. **基础依赖准备**: 
   `pnpm install` → `pnpm download-binaries`
2. **平台特异性构建**:
   - Windows: 运行 `pnpm build-tun --release` 编译 TUN 服务二进制。
   - macOS: 运行 `pnpm prebundle` 组装 Helper 工具。
3. **整体打包**: 
   `pnpm tauri build` (或使用 `pnpm release` 串联所有步骤)。

## 4. 输出产物矩阵

| 平台 | 格式 | 生成路径 |
|---|---|---|
| Windows | NSIS `.exe` | `src-tauri/target/release/bundle/nsis/` |
| Windows | WiX `.msi` | `src-tauri/target/release/bundle/msi/` |
| macOS | `.dmg` | `src-tauri/target/release/bundle/dmg/` |
| macOS | `.app` | `src-tauri/target/release/bundle/macos/` |
| Linux | `.deb` | `src-tauri/target/release/bundle/deb/` |
| Linux | `.AppImage`| `src-tauri/target/release/bundle/appimage/` |

## 5. NPM 脚本参考

- `dev` / `preview`: 纯前端的 Vite 构建生命周期。
- `tauri`: Tauri CLI 透传。
- `download-binaries`: 触发 `scripts/download-binaries.ts` 下载 sing-box。
- `build-tun`: 触发 `scripts/build-tun-service.ts` 编译系统服务（仅 Windows）。
- `release`: 一键完成产物拉取、周边服务编译、前端构建及 Tauri 打包的流水线。

## 6. 配置模板机制
AureStream 的内核配置不再依赖外部网络请求，而是内置在代码仓库的 `src/config/templates/config-template.jsonc` 中。
在打包时，通过 Vite 的 `?raw` 原生导入支持与 `jsonc-parser` 实现模板加载并组装。

## 7. 便携模式 (Portable Mode)
- **Windows**: 在生成的 `.exe` 相同目录下创建一个名为 `aurestream.portable` 的空文件，应用启动时检测到此文件，会将 `settings.json`、`data.db` 等所有用户数据重定向到可执行文件所在目录下的 `.aurestream_data` 文件夹内，不再使用系统的 AppData 目录。
