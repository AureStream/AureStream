# 主窗口关闭与各平台托盘行为

点击主窗口关闭按钮时进程不退出，进入托盘后台；从托盘可再次打开主界面。

## 行为矩阵

| 平台 | 行为 |
| --- | --- |
| Windows / Linux | 官方推荐：[`CloseRequestApi::prevent_close`](https://docs.rs/tauri/latest/tauri/struct.CloseRequestApi.html#method.prevent_close) + [`Window::hide`](https://docs.rs/tauri/latest/tauri/window/struct.Window.html#method.hide)；托盘期用 [`Window::set_skip_taskbar(true)`](https://docs.rs/tauri/latest/tauri/window/struct.Window.html#method.set_skip_taskbar)（与 [`WindowConfig.skipTaskbar`](https://v2.tauri.app/reference/config/#windowconfig) 对应，本仓库在 `tauri.conf.json` 主窗口显式设为 `false`，运行时切换） |
| macOS | [`AppHandle::set_activation_policy(Accessory)`](https://docs.rs/tauri/latest/tauri/struct.AppHandle.html#method.set_activation_policy)（官方示例用法）+ `hide`；恢复主界面时 `Regular`。**菜单栏托盘**保留 |

恢复主界面：macOS `set_activation_policy(Regular)`；Windows / Linux `set_skip_taskbar(false)`；共通 `show`、`set_focus`。实现：`src-tauri/src/lib.rs` 的 `enter_tray_mode`、`show_main_window` 与 `CloseRequested`（先 `prevent_close` 再进入托盘）。

## 说明

- Tauri 不提供单独的 `closeToTray` 配置项；关窗拦截与上述 API 组合为项目约定实现。
- 主窗口隐藏后，WebView 的节流/休眠由系统与内核随 **document visibility** 默认策略处理，无额外全局开关。

## 关于 macOS `ActivationPolicy::Accessory` 与配置

- **`Accessory` 仅作用于 macOS**，这一点正确；Windows / Linux 没有同名系统概念。
- **当前 Tauri 2 的 `tauri.conf.json` 中，`bundle.macOS` 没有 `activationPolicy` 字段**（以工程依赖的 `tauri-utils` 为准）。下面这种写法**不能**作为官方配置使用，且往往会因 `deny_unknown_fields` **直接导致配置无法解析**：

```json
{
  "bundle": {
    "macOS": {
      "activationPolicy": "Accessory"
    }
  }
}
```

- **macOS**：运行时切换「仅菜单栏托盘 ↔ 带 Dock 的前台应用」用 **`AppHandle::set_activation_policy`**（`Accessory` / `Regular`），与 `NSApplicationActivationPolicy` 一致。若需安装期行为，可用 **`bundle.macOS.infoPlist`** 合并 plist。
- **Windows / Linux**：无 `ActivationPolicy`；官方方式为上述 **`prevent_close` + `hide`**，任务栏行为以 **`set_skip_taskbar`** / 配置 **`skipTaskbar`** 为准（部分环境或版本可能存在差异，属上游已知限制）。
