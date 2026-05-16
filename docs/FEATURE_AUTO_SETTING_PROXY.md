这是一份为您量身撰写的 **AureStream 系统代理接管方案**。本方案摒弃了存在缺陷的第三方简易库，采用商业级代理软件（如 Clash Verge、V2rayN）的底层原生调用标准，确保 HTTP、HTTPS 和 SOCKS5 全协议完美接管。

你可以直接将其作为内部开发文档、提测标准下发给前端和 Rust 研发人员。

---

# AureStream 系统代理接管方案 (System Proxy Takeover Plan)

**版本号**: v1.1.0
**模块负责人**: Tauri 研发组 / 前端研发组
**目标**: 实现操作系统全局流量的无感劫持，完美支持常规浏览器及严格依赖 SOCKS5 的特殊应用（如 Telegram），并提供防断网的生命周期保护。

---

## 0. 当前仓库实现约定（2026-05）

> 以下条目用于对齐当前代码行为；若与后文历史示例有差异，以本节为准。

1. **监听地址固定为 `127.0.0.1`**，不再由用户在 UI 配置。
2. **Mihomo 使用运行时高位随机可用端口（`mixed-port`）**，由后端在连接阶段分配，非用户可配置项。
3. **系统代理排除列表来自应用设置持久化项**（前端设置页「排除代理的地址」），使用逗号分隔并在后端转换为 OS 所需参数格式。
4. 系统代理启用时，HTTP / HTTPS / SOCKS 均使用运行时实际绑定端口；断开/退出时按现有逻辑清理代理状态。

---

## 1. 方案背景与设计核心

Mihomo 内核启动后，仅会在本地开启 `127.0.0.1:7890` 的混合监听端口。将操作系统流量引导至该端口，是 AureStream 客户端的核心职责。

**本方案的核心设计原则：**

1. **全协议覆盖**：不仅劫持 Web 流量，必须强制操作系统写入 `SOCKS5` 代理配置。
2. **底层原生调用**：不使用 `sysproxy` 库，直接通过 Rust 调用 Windows 注册表 / macOS `networksetup` / Linux `gsettings`，消除第三方依赖黑盒。
3. **零提权体验**：系统代理模式运行在用户态，不需要任何管理员 UAC 弹窗或 Root 密码输入。
4. **致命防御 (Kill-Switch)**：软件关闭时必须 100% 确保代理配置被清空，防止用户面临“软件关了上不了网”的灾难性 Bug。

---

## 2. 核心参数定义 (Constants)

在跨平台实现中，统一采用以下核心参数：

- **核心监听地址**: `127.0.0.1`
- **核心监听端口**: `7890` (Mihomo Mixed-Port)
- **全局绕过规则 (Bypass)**: 确保本地开发和局域网设备（NAS/打印机）不被代理卡死。
  - `localhost;127.*;10.*;172.16.*;172.17.*;172.18.*;172.19.*;172.20.*;172.21.*;172.22.*;172.23.*;172.24.*;172.25.*;172.26.*;172.27.*;172.28.*;172.29.*;172.30.*;172.31.*;192.168.*;<local>`

---

## 3. Rust 后端实现规范 (Tauri Backend)

### 3.1 工程依赖配置

修改 `src-tauri/Cargo.toml`，仅在 Windows 编译时引入注册表操作库：

```toml
[target.'cfg(target_os = "windows")'.dependencies]
winreg = "0.52"
```

### 3.2 跨平台系统 API 调用代码

在 `src-tauri/src/main.rs` 中，编写跨平台的代理设置逻辑。

```rust
use tauri::command;
use std::process::Command;

const PROXY_PORT: u16 = 7890;
const BYPASS_RULES: &str = "localhost;127.*;10.*;172.16.*;172.17.*;172.18.*;172.19.*;172.20.*;172.21.*;172.22.*;172.23.*;172.24.*;172.25.*;172.26.*;172.27.*;172.28.*;172.29.*;172.30.*;172.31.*;192.168.*;<local>";

#[command]
fn enable_system_proxy() -> Result<(), String> {
    set_system_proxy_impl(true, PROXY_PORT).map_err(|e| format!("接管系统网络失败: {}", e))
}

#[command]
fn disable_system_proxy() -> Result<(), String> {
    set_system_proxy_impl(false, PROXY_PORT).map_err(|e| format!("释放系统网络失败: {}", e))
}

// ---------------------------------------------------------
// [Windows] 注册表强力注入 (涵盖 SOCKS5)
// ---------------------------------------------------------
#[cfg(target_os = "windows")]
fn set_system_proxy_impl(enable: bool, port: u16) -> Result<(), std::io::Error> {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let path = "Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";
    let (key, _) = hkcu.create_subkey(path)?;

    if enable {
        key.set_value("ProxyEnable", &1u32)?;
        // 核心：强制拆分三协议端口，解决 Telegram 不走代理的 Bug
        let proxy_server = format!("http=127.0.0.1:{0};https=127.0.0.1:{0};socks=127.0.0.1:{0}", port);
        key.set_value("ProxyServer", &proxy_server)?;
        key.set_value("ProxyOverride", &BYPASS_RULES)?;
    } else {
        key.set_value("ProxyEnable", &0u32)?;
    }

    // 触发系统广播，使 Chrome/Edge 无需重启立即生效
    Command::new("powershell")
        .args(&["-Command", "[system.net.webrequest]::defaultwebproxy = new-object system.net.webproxy"])
        .spawn()
        .ok();
    Ok(())
}

// ---------------------------------------------------------
// [macOS] Networksetup 动态网卡获取与代理注入
// ---------------------------------------------------------
#[cfg(target_os = "macos")]
fn set_system_proxy_impl(enable: bool, port: u16) -> Result<(), std::io::Error> {
    use std::process::Command;

    // 1. 动态获取当前活跃的网络服务名称
    let network_service = get_active_mac_network_service()
        .unwrap_or_else(|| String::from("Wi-Fi")); // 如果获取失败，降级回退到 "Wi-Fi"

    let port_str = port.to_string();

    if enable {
        Command::new("networksetup").args(&["-setwebproxy", &network_service, "127.0.0.1", &port_str]).output()?;
        Command::new("networksetup").args(&["-setwebproxystate", &network_service, "on"]).output()?;
        Command::new("networksetup").args(&["-setsecurewebproxy", &network_service, "127.0.0.1", &port_str]).output()?;
        Command::new("networksetup").args(&["-setsecurewebproxystate", &network_service, "on"]).output()?;
        Command::new("networksetup").args(&["-setsocksfirewallproxy", &network_service, "127.0.0.1", &port_str]).output()?;
        Command::new("networksetup").args(&["-setsocksfirewallproxystate", &network_service, "on"]).output()?;
        Command::new("networksetup").args(&["-setproxybypassdomains", &network_service, "127.0.0.1", "localhost", "192.168.*", "10.*"]).output()?;
    } else {
        Command::new("networksetup").args(&["-setwebproxystate", &network_service, "off"]).output()?;
        Command::new("networksetup").args(&["-setsecurewebproxystate", &network_service, "off"]).output()?;
        Command::new("networksetup").args(&["-setsocksfirewallproxystate", &network_service, "off"]).output()?;
    }
    Ok(())
}

/// 辅助函数：获取 macOS 当前活跃的网络服务名称 (如 "Wi-Fi" 或 "Ethernet")
#[cfg(target_os = "macos")]
fn get_active_mac_network_service() -> Option<String> {
    use std::process::Command;

    // 步骤 A: 查找默认路由出口的 Device (例如 "en0")
    let route_output = Command::new("route")
        .args(&["-n", "get", "default"])
        .output()
        .ok()?;
    let route_str = String::from_utf8_lossy(&route_output.stdout);

    let mut active_device = "";
    for line in route_str.lines() {
        if line.trim().starts_with("interface:") {
            active_device = line.split(':').nth(1)?.trim();
            break;
        }
    }

    if active_device.is_empty() {
        return None;
    }

    // 步骤 B: 查找该 Device 对应的服务名 (Hardware Port)
    let hw_output = Command::new("networksetup")
        .arg("-listallhardwareports")
        .output()
        .ok()?;
    let hw_str = String::from_utf8_lossy(&hw_output.stdout);

    let mut last_hardware_port = "";
    for line in hw_str.lines() {
        if line.starts_with("Hardware Port:") {
            last_hardware_port = line.split(':').nth(1)?.trim();
        } else if line.starts_with("Device:") {
            let device = line.split(':').nth(1)?.trim();
            if device == active_device {
                return Some(last_hardware_port.to_string());
            }
        }
    }

    None
}

// ---------------------------------------------------------
// [Linux] GNOME 桌面环境适配
// ---------------------------------------------------------
#[cfg(target_os = "linux")]
fn set_system_proxy_impl(enable: bool, port: u16) -> Result<(), std::io::Error> {
    let p = port.to_string();
    if enable {
        Command::new("gsettings").args(&["set", "org.gnome.system.proxy", "mode", "'manual'"]).output()?;
        Command::new("gsettings").args(&["set", "org.gnome.system.proxy.http", "host", "'127.0.0.1'"]).output()?;
        Command::new("gsettings").args(&["set", "org.gnome.system.proxy.http", "port", &p]).output()?;
        Command::new("gsettings").args(&["set", "org.gnome.system.proxy.https", "host", "'127.0.0.1'"]).output()?;
        Command::new("gsettings").args(&["set", "org.gnome.system.proxy.https", "port", &p]).output()?;
        Command::new("gsettings").args(&["set", "org.gnome.system.proxy.socks", "host", "'127.0.0.1'"]).output()?;
        Command::new("gsettings").args(&["set", "org.gnome.system.proxy.socks", "port", &p]).output()?;
    } else {
        Command::new("gsettings").args(&["set", "org.gnome.system.proxy", "mode", "'none'"]).output()?;
    }
    Ok(())
}
```

### 3.3 注册指令与生命周期防护

在 `main` 函数挂载指令，并绑定窗口销毁事件：

```rust
fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![enable_system_proxy, disable_system_proxy])
        .on_window_event(|event| match event.event() {
            tauri::WindowEvent::Destroyed => {
                // 【核心防御】只要 UI 界面被销毁，无论程序是否崩溃，立即释放系统代理
                let _ = disable_system_proxy();
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

---

## 4. 前端集成规范 (UI Logic)

前端无需管理系统 OS 差异，只需结合当前界面的“连接/断开”状态，按顺序调度 API。

```typescript
import { invoke } from "@tauri-apps/api/tauri";
// 假设此处引入了 mihomo 内核控制 API
import {
  selectNodeForGroup,
  startMihomoCore,
  stopMihomoCore,
} from "@/api/mihomo";

export const NetworkManager = {
  /**
   * 发起连接：启动内核 -> 选定节点 -> 接管系统代理
   */
  async connect(nodeName: string) {
    try {
      // 1. 确保内核运行（内置模板导出组：`AureStream_Node_Selector`）
      await startMihomoCore();
      await selectNodeForGroup("AureStream_Node_Selector", nodeName);

      // 2. 接管系统流量
      await invoke("enable_system_proxy");
      return true;
    } catch (error) {
      console.error("连接异常:", error);
      // 发生异常时，立刻执行清理，防止内核卡死但代理已开
      await this.disconnect();
      throw error;
    }
  },

  /**
   * 断开连接：释放系统代理 -> 停止内核
   */
  async disconnect() {
    try {
      await invoke("disable_system_proxy");
      await stopMihomoCore();
      return true;
    } catch (error) {
      console.error("断开异常:", error);
      throw error;
    }
  },
};
```

---

## 5. QA 测试验收标准

研发提测后，QA 人员需严格按照以下三项指标进行验收：

| 测试项               | 验证平台  | 验证方法                                                                         | 预期结果                                                                                 |
| :------------------- | :-------- | :------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------- |
| **SOCKS5 接管测试**  | Win / Mac | 开启代理后，直接打开 Telegram（网络设置保持“使用系统代理”）。                    | Telegram 无需任何手动设置，瞬间显示为“已连接”并刷新消息。                                |
| **系统配置落盘测试** | Win       | 打开 Windows `设置 -> 网络和 Internet -> 代理`。                                 | “使用代理服务器”开关为开。点击编辑，里面显示的内容必须包含 HTTP, HTTPS, SOCKS 协议字样。 |
| **系统配置落盘测试** | Mac       | 打开 `系统设置 -> 网络 -> Wi-Fi -> 详细信息 -> 代理`。                           | 网页代理(HTTP)、安全网页代理(HTTPS)、**SOCKS 代理**，三个开关全部处于勾选开启状态。      |
| **灾难恢复测试**     | Win / Mac | 在处于“已连接”的状态下，通过任务管理器强制杀掉 AureStream 或点击右上角 `X` 关闭。 | 操作系统的代理设置瞬间恢复为空，使用 Chrome 打开百度/淘宝等网页能正常访问（未断网）。    |
