# macOS 安装提示「已损坏」或无法打开

## 原因说明

从 **GitHub Actions / 浏览器** 下载的 DMG、或未使用 **Developer ID + 公证（Notarization）** 发布的构建，常见情况不是文件真的损坏，而是 **Gatekeeper** 拒绝运行未受信任签名的应用。中文系统里有时会把这种情况文案显示成「已损坏」。

另外，Tauri 默认会为 macOS 启用 **Hardened Runtime**；在 **无苹果开发者证书签名** 的场景下，与本项目内置的 **未签名 sidecar（mihomo）** 组合，容易导致验签失败。当前仓库在 `tauri.conf.json` 的 `bundle.macOS.hardenedRuntime` 中对开源/CI 构建设为 `false`，以减轻此类误报。若你已为应用配置正式签名与公证，应改回 `true` 并配套 entitlements。

## 用户侧可执行操作（未公证的安装包）

1. **移除隔离属性**（下载文件常带 `com.apple.quarantine`）。默认已把应用拖入「应用程序」时，可在终端执行：

   ```bash
   xattr -cr "/Applications/AureStream.app"
   ```

   若你的 `.app` 不在上述路径，请把引号内换成实际路径（可将 `.app` 从访达拖进终端自动填入路径）。若仍只在 DMG 中，请先把 AureStream 拖入「应用程序」文件夹，再执行上述命令。

2. **系统设置**：**隐私与安全性** 中若出现被阻止提示，可选择 **仍要打开**（具体文案随 macOS 版本略有不同）。

3. **访达中强制打开**：按住 **Control** 点按应用图标 → **打开**，在弹出对话框中确认（首次放行后，之后一般可正常双击启动）。

对面向公众的 macOS 安装包，应在 CI 或本地配置 **Apple Developer ID Application** 证书签名，并走 **notarytool** 公证流程；完成后 Gatekeeper 可正常放行，无需用户执行 `xattr`。

相关环境变量与流程见 Tauri 文档：[macOS 应用分发](https://v2.tauri.app/distribute/macos-application-bundle/)。
