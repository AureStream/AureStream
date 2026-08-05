# 构建与部署

> v2 MVP：Xray-core 侧车 + 系统代理。无 TUN / 无 privileged helper 默认路径。

## 1. 环境要求

- **Node.js**: v18+ (推荐 LTS)
- **包管理器**: pnpm 11.4.0 (推荐 Corepack)
- **Rust**: stable (Rustup)
- **平台特定**:
  - Windows: Visual Studio C++ Build Tools
  - Linux: `webkit2gtk`、`libxdo`、`ssl`、`appindicator`、`rsvg` 等 dev 包
  - macOS: Xcode Command Line Tools

## 2. 开发环境搭建

```bash
pnpm install
pnpm download-binaries   # Xray → src-tauri/binaries/aurestream-core-* + geoip/geosite
pnpm tauri dev
```

## 3. 构建流程

1. `pnpm install` → `pnpm download-binaries`
2. 前端与打包：`pnpm build` → `pnpm tauri build`
3. 一键流水线：`pnpm release`（= download-binaries + build + tauri build）

**不再默认执行**：`pnpm build-tun`、`pnpm pre-bundle`（legacy TUN / helper 脚本仍可能存在于 `scripts/`，仅供参考）。

## 4. CI 构建

`.github/workflows/build-desktop.yml` 在 `workflow_dispatch` 或 Release 发布时构建新树：

- 先 `pnpm build` + `cargo check --workspace`
- 再 `pnpm download-binaries` 与 Tauri bundle
- **不**构建 Windows TUN service，**不**预构建 macOS privileged helper

矩阵：linux-x64 / linux-arm64 / windows-x64 / windows-arm64 / macos-aarch64 / macos-x64

## 5. 输出产物

| 平台 | 格式 | 路径 |
|------|------|------|
| Windows | NSIS `.exe` / WiX `.msi` | `src-tauri/target/.../release/bundle/nsis|msi/` |
| macOS | `.dmg` / `.app` | `src-tauri/target/.../release/bundle/dmg|macos/` |
| Linux | `.deb` / `.rpm` / `.AppImage` | `src-tauri/target/.../release/bundle/deb|rpm|appimage/` |

## 6. NPM 脚本

| 脚本 | 说明 |
|------|------|
| `dev` / `build` | Vite 开发与生产构建 |
| `tauri` | Tauri CLI 透传 |
| `download-binaries` | 下载 Xray 侧车与 geo 规则库 |
| `release` | 下载侧车 + 前端构建 + Tauri 打包（无 TUN） |

## 7. Sidecar 资源

- 二进制：`src-tauri/binaries/aurestream-core-<rust-target-triple>[.exe]`
- Geo：`src-tauri/resources/geoip.dat`、`geosite.dat`
- Tauri：`externalBin: binaries/aurestream-core`，`resources/**/*`
