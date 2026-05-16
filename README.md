# AureStream

> 一款简洁易用的桌面端网络代理客户端，帮助你在本机安全、便捷地管理代理连接与订阅。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

---

## 简介

AureStream 提供统一的图形界面，用于开关代理、切换规则与节点、管理服务商订阅，并查看连接与流量等相关信息。支持在常见桌面系统上运行；关闭主窗口后可保留在系统托盘，随时唤回。

## 配置与数据目录

应用捆绑标识符为 **`com.root.aurestream`**。以下内容相对「应用配置目录」与「本地数据目录」表述（均由 Tauri 按平台解析，与上述 identifier 对齐）：

- **配置目录**：`aurestream.yaml`（后端主配置）、`subscriptions/`、`runtime/aurestream-mihomo.yaml`（运行时 Mihomo 配置）等；
- **本地数据目录**：`mihomo-work/`（内核工作区与 geodata）。

常见绝对路径示意（仅供参考，以当前系统为准）：

| 平台    | 配置目录示意 |
| ------- | ------------- |
| macOS   | `~/Library/Application Support/com.root.aurestream/` |
| Windows | `%APPDATA%\com.root.aurestream\` |
| Linux   | `~/.config/com.root.aurestream/` |

## 预览

界面截图可在后续版本补充至此（欢迎通过 PR 提供）。

## 主要功能

- **连接与模式**：一键连接，支持规则 / 全局 / 直连等常用模式  
- **订阅与节点**：管理多个服务商与订阅，选择节点、查看延迟、批量测速  
- **状态展示**：集中查看当前节点、速率、订阅余量与网络信息  
- **外观**：浅色 / 深色主题，界面清晰易读  
- **系统托盘**：关闭窗口后驻留后台，从托盘快速打开主界面  

## 下载

若已发布安装包，请在 [**Releases**](https://github.com/BadKid90s/aureproxy/releases) 中选择适合你系统的版本下载安装。

具体支持的平台与安装方式以发布说明为准。

## 参与贡献

欢迎通过 [Issue](https://github.com/BadKid90s/aureproxy/issues) 反馈问题或提出建议；也欢迎提交 Pull Request。更详细的说明与内部文档见仓库内 [`docs/`](docs/README.md) 目录。

## 许可证

本项目以 [MIT 许可证](https://opensource.org/licenses/MIT) 开源。

## 声明

请确保在**遵守当地法律法规**的前提下使用本软件；开发者不对用户的使用行为及其后果承担责任。
