# Universal Subscription Engine（统一订阅解析引擎）设计方案

目标：

构建一个：

* 多格式
* 多协议
* 多内核
* 可扩展
* 可热更新
* 可插件化

的统一订阅解析系统。

核心理念：

```txt id="1g1kmt"
任何订阅格式
      ↓
统一协议抽象
      ↓
Universal Endpoint
```

最终：

```txt id="t18n5o"
UI / 内核 / 数据库
全部不依赖具体订阅格式
```

---

# 一、整体目标

支持：

## 订阅格式

| 格式                | 支持 |
| ----------------- | -- |
| Clash/Mihomo YAML | ✅  |
| sing-box JSON     | ✅  |
| V2Ray Base64      | ✅  |
| SIP008            | ✅  |
| Surge             | ✅  |
| Quantumult X      | ✅  |
| Shadowrocket      | ✅  |

---

## 协议

| 协议          | 支持 |
| ----------- | -- |
| Shadowsocks | ✅  |
| VMess       | ✅  |
| VLESS       | ✅  |
| Trojan      | ✅  |
| TUIC        | ✅  |
| Hysteria2   | ✅  |
| WireGuard   | ✅  |
| SOCKS5      | ✅  |
| HTTP        | ✅  |

---

# 二、总体架构

推荐：

```txt id="fdkmkl"
                    Subscription URL
                             │
                             ▼
                     Fetch Engine
                             │
                             ▼
                    Format Detector
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
   Clash Parser       SingBox Parser       V2Ray Parser
        │                    │                    │
        └──────────────┬─────┴────────────────────┘
                       ▼
                  RawProxyNode
                       ▼
               Protocol Parser
                       ▼
               Universal Endpoint
                       ▼
                   Normalizer
                       ▼
                    Storage
```

---

# 三、核心抽象设计（最重要）

# 1. Universal Endpoint

这是全系统唯一标准节点模型。

```rust id="ukjjit"
pub struct Endpoint {
    pub id: String,

    pub name: String,

    pub protocol: Protocol,

    pub server: String,
    pub port: u16,

    pub udp: bool,
    pub tls: bool,

    pub network: Option<NetworkType>,

    pub auth: AuthInfo,

    pub transport: TransportInfo,

    pub metadata: Metadata,

    pub raw: serde_json::Value,
}
```

---

# 2. RawProxyNode

格式解析后的中间层。

```rust id="b76f3v"
pub struct RawProxyNode {
    pub protocol: String,

    pub source_format: String,

    pub data: serde_json::Value,
}
```

---

# 为什么需要 RawProxyNode

因为：

# 订阅格式 ≠ 协议。

例如：

| 格式       | 协议             |
| -------- | -------------- |
| Clash    | vmess/vless/ss |
| sing-box | vmess/trojan   |
| Surge    | ss/trojan      |

所以：

---

# Format Parser

负责：

```txt id="d0f0mf"
格式解析
```

---

# Protocol Parser

负责：

```txt id="mgfr07"
协议语义解析
```

---

# 四、插件系统设计

# 插件分层

推荐：

```txt id="5yy2k5"
plugins/
├── format/
└── protocol/
```

---

# 五、Format Parser 插件

## Trait

```rust id="1q5c9r"
pub trait FormatParser: Send + Sync {
    fn name(&self) -> &str;

    fn supports(&self, content: &str) -> bool;

    fn parse(
        &self,
        content: &str,
    ) -> anyhow::Result<Vec<RawProxyNode>>;
}
```

---

# 示例

## ClashParser

```rust id="3lcrsb"
impl FormatParser for ClashParser {
    fn supports(&self, content: &str) -> bool {
        content.contains("proxies:")
    }
}
```

---

# 六、Protocol Parser 插件

## Trait

```rust id="f3oqho"
pub trait ProtocolParser: Send + Sync {
    fn protocol(&self) -> &str;

    fn parse(
        &self,
        raw: &RawProxyNode,
    ) -> anyhow::Result<Endpoint>;
}
```

---

# 七、插件注册系统

```rust id="n7ljod"
pub struct ParserRegistry {
    format_parsers:
        HashMap<String, Box<dyn FormatParser>>,

    protocol_parsers:
        HashMap<String, Box<dyn ProtocolParser>>,
}
```

---

# 八、订阅解析流程

```txt id="fjlyoi"
Raw Content
    ↓
Format Detector
    ↓
Format Parser
    ↓
RawProxyNode[]
    ↓
Protocol Parser
    ↓
Endpoint[]
    ↓
Normalizer
```

---

# 九、Normalizer（非常关键）

因为：

不同格式字段不同。

例如：

| 格式       | 字段             |
| -------- | -------------- |
| Clash    | ws-opts.path   |
| sing-box | transport.path |
| URI      | path           |

都应统一：

```txt id="oh4ffm"
transport.path
```

---

# 十、Fetcher 模块

推荐：

```txt id="mgt4lo"
fetcher/
├── http
├── cache
├── retry
├── gzip
├── base64
└── validator
```

---

# 功能

支持：

* gzip
* deflate
* base64
* redirect
* ETag
* If-Modified-Since
* timeout
* retry

---

# 十一、数据存储

推荐：

# SQLite

使用：

* SQLite
* sqlx

---

# 表结构

## subscriptions

```sql id="ykjyiv"
CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  name TEXT,
  type TEXT,
  url TEXT,
  enabled INTEGER,
  updated_at INTEGER
);
```

---

## endpoints

```sql id="46scz7"
CREATE TABLE endpoints (
  id TEXT PRIMARY KEY,
  source_id TEXT,
  protocol TEXT,
  name TEXT,
  server TEXT,
  port INTEGER,
  raw_json TEXT
);
```

---

# 十二、插件加载方案（阶段性）

# Phase 1

## 静态注册

推荐：

```rust id="9pq8x0"
registry.register(Box::new(ClashParser));
```

优点：

* 稳定
* 简单
* 跨平台

---

# Phase 2

## 动态插件

```txt id="r91qzq"
plugins/
  clash.dll
  singbox.so
```

Rust：

* libloading

---

# Phase 3（推荐最终方案）

# WASM 插件系统

推荐：

```txt id="f9n3uz"
Runtime Core
      ↓
WASM Sandbox
      ↓
Parser Plugin
```

---

# 十三、为什么推荐 WASM

因为解析器：

```txt id="wb3qyw"
string -> structured data
```

不需要：

* 文件权限
* 网络权限
* 系统调用

所以：

# WASM 天然适合。

---

# WASM 优势

## 1. 沙箱安全

机场订阅是不可信输入。

---

## 2. 热更新

无需升级客户端。

---

## 3. 跨平台

同一插件：

* Windows
* macOS
* Linux

通用。

---

# 十四、推荐目录结构

```txt id="m7q5k6"
subscription-engine/
├── core/
│
├── fetcher/
│
├── detector/
│
├── parsers/
│   ├── format/
│   └── protocol/
│
├── normalizer/
│
├── wasm/
│
├── storage/
│
└── tests/
```

---

# 十五、协议实现优先级（推荐）

# Phase 1（必须）

## 格式

* Clash
* V2Ray Base64

## 协议

* ss
* vmess
* vless
* trojan

这是 90% 用户。

---

# Phase 2

## 格式

* sing-box
* SIP008

## 协议

* tuic
* hysteria2

---

# Phase 3

## 格式

* Surge
* Quantumult X

---

# 十六、兼容性策略（极重要）

# 永远保留：

```rust id="24t2w6"
raw: serde_json::Value
```

因为：

机场永远会魔改字段。

例如：

```yaml id="kydjr3"
client-fingerprint:
reality-opts:
obfs-password:
```

未来协议升级时：

# raw 能救命。

---

# 十七、测试体系（重要）

# 必须建立：

```txt id="f9h1f9"
subscription corpus
```

即：

```txt id="ktzbk3"
tests/data/
```

存：

* 各种机场配置
* 各种协议
* 魔改订阅

避免升级后崩。

---

# 十八、性能设计

## 不要：

```txt id="t8fqot"
解析后立即生成 config
```

而是：

```txt id="6t6sya"
解析
↓
存储 Endpoint
↓
按需生成 runtime config
```

---

# 十九、最终阶段目标

最终：

# 任何格式

```txt id="ayuy4i"
Clash
sing-box
v2ray
surge
```

全部：

```txt id="4agkqz"
→ Endpoint
```

然后：

# 任意内核

```txt id="mbrkn5"
Mihomo
sing-box
Xray
```

全部：

```txt id="r8ahya"
← Endpoint
```

这是整个系统最关键的架构。

---

# 二十、完整阶段计划（推荐）

# Phase 1（当前）

## 目标

建立统一抽象。

## 完成：

* Endpoint Schema
* Clash Parser
* V2Ray Parser
* vmess/vless/ss/trojan
* SQLite
* Mihomo Adapter

---

# Phase 2

## 目标

协议解耦。

## 完成：

* RawProxyNode
* Protocol Parser
* Normalizer
* sing-box parser
* TUIC
* Hysteria2

---

# Phase 3

## 目标

插件系统。

## 完成：

* Parser Registry
* 动态注册
* 插件发现
* Plugin Metadata

---

# Phase 4

## 目标

WASM Runtime。

## 完成：

* WASM sandbox
* 热更新 parser
* 第三方 parser SDK
* Marketplace

---

# Phase 5

## 目标

生态化。

## 完成：

* 第三方协议
* 在线 parser 更新
* 社区 parser
* 多语言 parser SDK

---

# 最后一个关键建议

你整个项目：

# 最重要的不是 UI。

也不是 Mihomo。

而是：

# “统一抽象层”。

只要：

```txt id="14v0cl"
所有东西 → Endpoint
```

你整个系统未来就会非常强。
