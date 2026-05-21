# Windows Mihomo：proxy-provider 路径与安全目录（SAFE_PATH）

## 现象

日志中出现类似 fatal：

```text
parse proxy provider AureStream_Sub error: path is not subpath of home directory or SAFE_PATHS: C:\Users\<实际用户>\...\subscriptions\<id>.yaml
allowed paths: [C:\Users\<可能与上面不一致的路径>\...\mihomo-work]
```

## 原因概要

Mihomo 对 `proxy-providers` 中 **`type: file`** 的 `path` 会做校验：**规范化后的路径**必须落在进程的 **home（由启动参数 `-d` 推导）或其 SAFE_PATHS** 之下。

若在 YAML 中使用**主机侧的绝对路径**（尤其经 `canonicalize()`、长路径 `\\?\`、符号链接/用户目录别名等），可能出现与内核内部对「home」的规范化**字符串不一致**，从而误判为“不在允许子路径下”，即使用户名或目录在直觉上相同。

## AureStream 侧修复策略

- 订阅文件仍复制到 **`%LOCALAPPDATA%\com.root.aurestream\mihomo-work\subscriptions\<provider_id>.yaml`**。
- 写入 Mihomo 运行 YAML 时，`proxy-providers.path` 使用**相对 `-d` 的路径**：`subscriptions/<provider_id>.yaml`（POSIX 分隔符，与 Mihomo 解析惯例一致）。
- 侧进程启动时 `-d` 指向同一 `mihomo-work` 目录，使相对路径始终在 home 树下解析。

## 用户侧若仍异常

可提供：生成的 `runtime/aurestream-mihomo.yaml` 中与 `proxy-providers`/`path` 相关的片段、mihomo 日志时间及启动方式，便于比对 `-d` 与 `path` 是否同源。
