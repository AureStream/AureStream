# 系统代理与 TUN：捕获与 DNS

**当前实现就是推荐方案**（不换内核、允许改系统 DNS）。本文与代码同步；实现以 `crates/aurestream-engine` 与 `crates/aurestream-platform-tun` 为准。

依据：[Xray 内置 DNS](https://xtls.github.io/config/dns.html)、[TUN inbound](https://xtls.github.io/config/inbounds/tun.html)、[FakeDNS](https://xtls.github.io/config/fakedns.html)（本应用 **不启用** FakeDNS）。

不包含 Xray-core 没有的能力：不换 sing-box/Clash、不上 Windows WFP、不在本机抢 53 端口、不做三端 NRPT。

## 推荐方案对照（= 当前代码）

| 层 | 做法 |
|---|---|
| 内核分流 | 内网 → 国内（`skipFallback`）→ DoH；`enableParallelQuery: false`；不开 FakeDNS |
| TUN 53 | `tun-in` port 53 → `dns-out` → 内置 DNS |
| 系统代理 | **不改** 系统 DNS |
| Linux TUN | `utun233`：`1.1.1.1` + `domain ~.`；物理网卡只留私网 DNS；失败才在物理网卡上设 `~.` |
| Windows TUN | `settings.dns` 写 TUN 网卡；物理网卡 `NameServer` **只留** `1.1.1.1` + `ipconfig /flushdns` |
| macOS TUN | `networksetup` 把主服务 DNS **独占**为 `1.1.1.1`，再刷缓存 |
| 时序 | 等 core API 就绪再改系统 DNS；停止时先还原再杀内核 |

## 共同前提

- 前端 / `aurestream-config` 不生成 Xray JSON；方言只在 `aurestream-engine` 的 `build_config`。
- 智能分流（默认）时 `dns.enableParallelQuery = false`：并行查询会把无 `domains` 的 DoH 也打给 `geosite:cn`，国内页会卡在 Cloudflare/Google 超时上。
- 内网名在 **Xray DNS 模块** 里解析，不在操作系统里维护 NRPT / `/etc/resolver` 主路径。
- FakeDNS 会污染本机 DNS，关闭后可能无法上网，因此不用。域名还原靠 TUN sniff（`http` / `tls` / `quic`）。

DNS 服务器顺序（智能分流）：

1. **内网**：`localhost`（系统代理）或启动 TUN 后改写为 `tcp+local://<RFC1918 DNS>`；`domains` 含 `geosite:private`、`domain:lan`、`domain:local`、`domain:home.arpa`，以及捕获到的搜索域；`skipFallback: true`。
2. **国内**：`119.29.29.29` / `223.5.5.5`，`geosite:cn` + `expectedIPs: geoip:cn`，`skipFallback: true`。
3. **其它**：Cloudflare / Google DoH（无 `domains`，承接未匹配查询）。

`dns-intranet` / `dns-direct` 查询走 `direct`；`dns-proxy` 走当前节点。

## 系统代理模式

默认路径，不需要特权 Helper。

```text
应用 → mixed 入站 127.0.0.1:10808
     → 系统代理（Win/macOS/Linux）指向该端口
     → 路由（LAN 直连，智能分流时 geosite:cn / geoip:cn 直连）
     → 节点 outbound
```

- **不改** 系统 DNS。浏览器若走系统解析，内网名仍问 DHCP/公司 DNS。
- Xray 自己解析域名时（SOCKS 远程 DNS、路由 `IPIfNonMatch` 等）走上面的 DNS 列表；内网条目是 `localhost`，即文档中的「本机预设 DNS」。
- 启动失败或停止时必须 `clear_system_proxy`。

## TUN 模式

可选路径。内核由特权 Helper 拉起，用户态不再二次 spawn。

```text
OS 把公网 DNS 问进隧道（见下）
  → tun-in（utun233）port 53 → dns-out → 内置 DNS 模块
  → 其它流量按 autoSystemRoutingTable 进 TUN（默认排除 LAN）
  → sniff http/tls/quic 还原域名后路由
```

启动顺序（三端相同）：生成配置 → 把 outbound 绑到物理网卡并排除节点 IP → **按捕获到的私网 DNS 改写 `dns-intranet`** → Helper 启动 core → **等 API 就绪再动系统 DNS** → 刷缓存。停止时先恢复 DNS 再杀内核。

没有 RFC1918/ULA 解析器时（家里只有 `8.8.8.8` + `114`），会去掉 `localhost` 内网条目，避免系统 DNS 已被劫持后 `localhost` 打回隧道形成环。

### Linux

Xray 的 TUN `settings.dns` **只在 Windows 生效**，Linux 用 `resolvectl`：

- `utun233`：`dns 1.1.1.1` + `domain ~.`（未匹配名进隧道）。
- 物理网卡：只保留捕获到的 **私网 DNS**；没有私网 DNS 时才写成 `1.1.1.1`。**不再**在物理网卡上设 `domain ~.`（那会吞掉内网后缀）。
- 若 `utun233` 写入失败，回退为物理网卡 `domain ~.`。
- 用户会话再执行一次 `resolvectl flush-caches`。

Helper：`aurestream-tun.socket` → `/usr/lib/AureStream/aurestream-tun-helper`。

### Windows

- TUN 网卡 DNS：`settings.dns = ["1.1.1.1", "8.8.8.8"]`（Xray 文档：仅 Windows）。
- 物理网卡 `NameServer` **只保留**劫持地址，并 `ipconfig /flushdns`。Windows 多宿主 DNS 会绑在物理网卡上问 `114`，包不进 TUN，所以不能把公网 DNS 留作备用。
- 内网名：启动前写入 `tcp+local://<私网 DNS>`，由 Xray 直连（`+local` 不走路由，避免回环）。

### macOS

- TUN `settings.dns` 无效；Helper 在 API 就绪后用 `networksetup` 把主服务 DNS **独占**为 `1.1.1.1`（不再把原服务器接在后面），然后 `dscacheutil` + `killall -HUP mDNSResponder`。
- 内网同样靠配置里的 `tcp+local://`。停止时先还原 DNS 再杀内核。
- 主应用被强杀后 Helper 独立恢复 DNS 的闭环仍不完整（见架构文档）。

## 明确不做的事

| 做法 | 原因 |
|---|---|
| FakeDNS | 文档警告污染本机 DNS |
| 系统 DNS 备用 `114` / `8.8.8.8` | 超时后抢答，污染 Google/YouTube |
| 物理网卡 `domain ~.` 作为 Linux 主路径 | 把内网后缀也送进劫持 |
| 三端各写 NRPT / `/etc/resolver` | 不是 Xray 文档路径，搜索域经常缺失 |

## 相关代码

| 模块 | 路径 |
|---|---|
| Xray DNS / TUN inbound | `crates/aurestream-engine/src/xray/config.rs` |
| 内网 DNS 注入 | `crates/aurestream-platform-tun/src/dns_policy.rs` |
| 出站绑物理网卡 | `crates/aurestream-platform-tun/src/config_patch.rs` |
| Linux Helper | `crates/aurestream-platform-tun/src/linux/` |
| Windows 服务 | `crates/aurestream-platform-tun/src/windows/` |
| macOS Helper | `crates/aurestream-platform-tun/src/macos/` |
