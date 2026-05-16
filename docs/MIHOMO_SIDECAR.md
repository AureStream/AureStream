# Mihomo Sidecar 与连接流程

## 行为概要

运行时配置由 **`build_aurestream_mihomo_config(providerId)`** 生成：内置规则与 `AureStream_Node_Selector`，**`proxy-providers.AureStream_Sub`** 为 **`type: file`**。Mihomo 只允许 `path` 位于内核 `-d`（即 **`mihomo-work`**）之下，因此会从应用配置里的 **`subscriptions/<provider_id>.yaml`** 复制到 **`mihomo-work/subscriptions/`**，再在生成 YAML 中写入该镜像的绝对路径（每次连接前同步）。`external-controller` 为 **`127.0.0.1:9090`**。模板中 **`log-level` 为 `info`**（便于看到 GeoSite/GeoIP 初始化与配置加载完成等日志）。规则链前置 **`DOMAIN,localhost`** 与 **`IP-CIDR,127.0.0.0/8`**（环回直连）。若出现 `localhost:80` dial 失败类 **warning**，多为本机程序经代理访问 `http://localhost` 或 hosts 误指向 `127.0.0.1`，可检查设置里环回绕过与 **`/etc/hosts`**。

连接流程：

1. 校验本地订阅文件存在（`get_subscription_path`）。
2. **`build_aurestream_mihomo_config(providerId)`** 写出 `runtime/aurestream-mihomo.yaml`。
3. **`start_mihomo_kernel`**：`-f` 上述文件，`-d` 为 **`mihomo-work`**，轮询 `GET 127.0.0.1:9090/version`（启动后先有短缓冲；墙钟最长约 **30 秒**）；若超时则终止 sidecar。首次 GEOIP/GEOSITE 拉取 geodata 若超过 30 秒会误报超时，可重试连接。

断开：先 **`closeAllConnections`**，再 **`stop_proxy`**（终止 sidecar；并尝试关闭本应用开启的系统代理，见下节）——节点列表会恢复为 SQLite 中的旧数据若有。

## 系统代理（macOS）

连接成功（Mihomo API 就绪）后，应用会读取本次运行配置中的 **`mixed-port`**（或 **`port`** + **`socks-port`**），并对当前网络位置下已启用的网络服务执行 `networksetup`，将 **HTTP / HTTPS / SOCKS** 指向 Mihomo（`bind-address` 为 `0.0.0.0` 等时写入系统仍使用 **127.0.0.1**，与仅本机使用一致）。

断开或应用退出并正常结束 sidecar 时，会尝试将上述代理**全部关闭**。若 `networksetup` 失败，终端会打印 `[system-proxy]` 日志，需用户在 **系统设置 › 网络 › 详情 › 代理** 中手动恢复。

**限制**：非 macOS 平台当前不修改系统代理；异常崩溃或未走正常断开流程时，系统代理可能残留；本实现不保存用户原有的代理设置（会在连接时被覆盖）。

节点选择（连接成功后）：

- **`getProxies`** 筛出叶子代理写入 Zustand `nodes`，`id/name` 与内核代理名一致；副标题若无 `server/port`（API 不提供）则显示协议类型；
- 「一键测速」对已连接：**`delayGroup('AureStream_Node_Selector', …)`**，与内置模板测速 URL 对齐；
- 点选：**`selectNodeForGroup('AureStream_Node_Selector', 节点名)`**；
- 打开「节点列表」弹层时会 **`refreshSubscriptionNodesFromMihomo`** 做一次列表同步。组名常量见 **`src/constants/mihomo.ts`**（`AURESTREAM_NODE_SELECTOR`，值为 `AureStream_Node_Selector`）。

## 开发前准备

`tauri.conf.json` 声明 `externalBin: ["binaries/mihomo"]`。需将 sidecar 二进制放入 `src-tauri/binaries/`（可用 `scripts/download-mihomo.sh`）。
