# 文档索引

本目录存放设计与实现说明；用户向的快速上手见仓库根目录 [README.md](../README.md)。

**Git**：远程 `git@github.com:BadKid90s/AureStream.git`，默认分支 **`main`**（与 `origin/HEAD` 一致；合并/发 PR 请以 `main` 为基线）。

## 总览与规格

| 文档 | 说明 |
| --- | --- |
| [SPEC.md](SPEC.md) | 技术规格与约定（栈、目录、数据流等） |
| [DESIGN.md](DESIGN.md) | 技术方案与架构、功能设计（长文） |

## 功能专题（FEATURE_*）

| 文档 | 说明 |
| --- | --- |
| [FEATURE_AUTO_SETTING_PROXY.md](FEATURE_AUTO_SETTING_PROXY.md) | 系统自动代理相关 |
| [FEATURE_BUILTIN_CLASH_MERGE.md](FEATURE_BUILTIN_CLASH_MERGE.md) | 内置 Clash/Mihomo 配置合并 |
| [FEATURE_NODE_ONLY_SELECTION.md](FEATURE_NODE_ONLY_SELECTION.md) | 仅节点切换等行为 |

## 运行与集成

| 文档 | 说明 |
| --- | --- |
| [MIHOMO_SIDECAR.md](MIHOMO_SIDECAR.md) | Mihomo 旁路进程与集成说明 |
| [PLATFORM_TRAY_MODE.md](PLATFORM_TRAY_MODE.md) | 各桌面关主窗口进托盘与任务栏/Dock 行为 |

## 后续改进

以下为产品与技术债方向，随迭代在此维护（原 `TODO.md` 已弃用）。

1. **节点测速体验**：测速过程中延迟展示加载态（骨架屏或转圈），有结果后再显示数值。
2. **网速与流量**：核对仪表盘速率是否为真实采样；必要时对接 Mihomo 流量或连接统计 API。
3. **网络与出口信息**：通过约定服务（如 ip.sb 或项目内 URL）展示当前出口 IP / 地理信息。
4. **存储瘦身**：评估用轻量持久化（JSON、Tauri Store 等）替代或收缩 SQLite 中的服务商/节点数据。
