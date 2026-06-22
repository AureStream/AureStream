# 构建与部署

## 1. 环境要求
- **Node.js**: v18+ (推荐 LTS)
- **包管理器**: pnpm 11.4.0 (推荐 Corepack)
- **Rust**: Edition 2024 (Rustup)
- **平台特定**:
  - Windows: Visual Studio C++ Build Tools
  - Linux: `webkit2gtk`、`libxdo`、`ssl`、`appindicator`、`rsvg` 等 dev 包
  - macOS: Xcode Command Line Tools；发布需有效开发者证书

## 2. 开发环境搭建

```bash
pnpm install
pnpm download-binaries   # 下载 sing-box 与规则库
pnpm tauri dev
```

## 3. 构建流程

1. `pnpm install` → `pnpm download-binaries`
2. 平台侧车/Helper：
   - **Windows**: `pnpm build-tun --release`
   - **macOS**: `pnpm pre-bundle`（编译并签名 Privileged Helper）
3. 前端与打包：`pnpm build` → `pnpm tauri build`
4. 一键流水线：`pnpm release`

### macOS 签名（可选）

本地对 `.app` / `.dmg` 重新签名：

```bash
pnpm sign-macos-bundle
```

脚本见 `scripts/sign-macos-bundle.sh`，需配置有效的 Developer ID 证书。

### Linux 打包资源

`src-tauri/tauri.conf.json` 将以下文件打入 deb/rpm：

| 安装路径 | 源文件 |
|----------|--------|
| `/usr/lib/AureStream/aurestream-tun-helper` | `../crates/aurestream-plugin-privilege/linux-helper/aurestream-tun-helper` |
| polkit / udev 规则 | `../crates/aurestream-plugin-privilege/linux-helper/*.policy`, `49-aurestream.rules` |
| postinst/postrm | `resources/linux/deb-*.sh` |

## 4. CI 构建

`.github/workflows/build-desktop.yml` 在 `workflow_dispatch` 或 Release 发布时构建：

- linux-x64 / linux-arm64
- windows-x64 / windows-arm64
- macos-aarch64 / macos-x64

## 5. 输出产物

| 平台 | 格式 | 路径 |
|------|------|------|
| Windows | NSIS `.exe` / WiX `.msi` | `src-tauri/target/release/bundle/nsis|msi/` |
| macOS | `.dmg` / `.app` | `src-tauri/target/release/bundle/dmg|macos/` |
| Linux | `.deb` / `.rpm` / `.AppImage` | `src-tauri/target/release/bundle/deb|rpm|appimage/` |

## 6. NPM 脚本

| 脚本 | 说明 |
|------|------|
| `dev` / `build` | Vite 开发与生产构建 |
| `tauri` | Tauri CLI 透传 |
| `download-binaries` | 下载 sing-box 侧车与规则库 |
| `build-tun` | 编译 Windows TUN 服务 |
| `pre-bundle` | macOS Helper 预构建 |
| `sign-macos-bundle` | macOS 应用包签名 |
| `release` | 完整发布流水线 |

## 7. 配置模板

内置 `src/config/templates/config-template.jsonc`，Vite `?raw` + `jsonc-parser` 加载，**不依赖外部网络同步**。

## 8. 便携模式 (Portable Mode)

Windows：在 `.exe` 同目录放置 `aurestream.portable` 或 `portable` 空文件，用户数据重定向到 `portable-data/`。
