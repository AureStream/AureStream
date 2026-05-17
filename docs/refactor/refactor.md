# 整体目标

你要做的本质上不是：

> “Clash GUI”

而是：

# 一个统一代理运行时平台（Universal Proxy Runtime Platform）

核心思想：

```txt id="v39u1v"
UI 永远不感知：
- Mihomo
- sing-box
- Xray
- Clash YAML
- sing-box JSON
- proxy-group
```

UI 只感知：

```txt id="e9r71v"
连接
节点
地区
延迟
模式
网络状态
```

这会决定你整个架构未来能不能扩展。

---

# 一、整体架构设计（推荐）

推荐：

```txt id="95ccr3"
┌────────────────────┐
│      Tauri UI      │
│ React / Vue / Svelte
└─────────┬──────────┘
          │ IPC
┌─────────▼──────────┐
│   Rust Runtime     │
│  (核心业务层)       │
├────────────────────┤
│ Subscription Engine│
│ Core Manager       │
│ Config Generator   │
│ Traffic Monitor    │
│ DNS/TUN Manager    │
│ Node Selector      │
│ State Manager      │
└─────────┬──────────┘
          │
 ┌────────┼────────┐
 │        │        │
▼         ▼        ▼
Mihomo  sing-box  Xray
```

---

# 二、最核心设计思想

# 永远不要让：

```txt id="dlx4tv"
Clash 配置
```

成为主数据。

而是：

# 你的数据库才是主数据。

所有内核配置：

```txt id="3f87br"
runtime generated
```

动态生成。

---

# 三、统一数据模型（最重要）

# 1. Endpoint Schema（统一节点模型）

这是整个系统最核心。

```ts id="4q4mvj"
interface Endpoint {
  id: string

  name: string

  protocol:
    | 'ss'
    | 'vmess'
    | 'vless'
    | 'trojan'
    | 'tuic'
    | 'hysteria2'
    | 'socks5'
    | 'http'

  server: string
  port: number

  udp: boolean
  tls: boolean

  network?:
    | 'tcp'
    | 'ws'
    | 'grpc'
    | 'http2'
    | 'quic'

  auth: {
    uuid?: string
    password?: string
    method?: string
    token?: string
  }

  transport: {
    host?: string
    path?: string
    sni?: string
    alpn?: string[]
  }

  metadata: {
    country?: string
    city?: string
    provider?: string

    latency?: number

    tags?: string[]
  }

  sourceId: string
}
```

---

# 2. Subscription Schema

```ts id="qqe3ch"
interface Subscription {
  id: string

  name: string

  type:
    | 'clash'
    | 'v2ray'
    | 'sing-box'
    | 'surge'
    | 'sip008'

  url: string

  enabled: boolean

  autoUpdate: boolean

  updateInterval: number

  lastUpdatedAt?: number

  nodeCount: number

  health: {
    status:
      | 'ok'
      | 'error'
      | 'expired'

    message?: string
  }
}
```

---

# 3. Core Schema

```ts id="y09f7n"
interface CoreRuntime {
  id: string

  type:
    | 'mihomo'
    | 'sing-box'
    | 'xray'

  version: string

  status:
    | 'running'
    | 'stopped'

  capabilities: {
    tun: boolean
    urlTest: boolean
    ruleEngine: boolean
  }
}
```

---

# 四、订阅系统设计（重点）

# Subscription Engine

推荐模块：

```txt id="6sbf6x"
subscription/
├── fetcher
├── parser
├── normalizer
├── validator
├── deduplicator
└── storage
```

---

# 1. Fetcher

负责：

* HTTP 拉取
* ETag
* If-Modified-Since
* gzip
* base64
* 重试
* timeout

---

# 2. Parser

支持：

| 格式           | 支持 |
| ------------ | -- |
| Clash YAML   | ✅  |
| V2Ray Base64 | ✅  |
| SIP008       | ✅  |
| sing-box     | ✅  |
| Surge        | ✅  |

输出统一：

```txt id="i6u0lx"
Endpoint[]
```

---

# 3. Normalizer

例如：

```txt id="a1z1fj"
vmess://
vless://
trojan://
```

全部统一为：

```txt id="gmbwqt"
Endpoint
```

---

# 4. Deduplicator

按：

```txt id="0t7cm5"
server + port + uuid
```

去重。

---

# 五、内核适配层（核心）

# Adapter Pattern

```ts id="7t4b6r"
interface CoreAdapter {
  start(): Promise<void>

  stop(): Promise<void>

  reload(): Promise<void>

  connect(nodeId: string): Promise<void>

  disconnect(): Promise<void>

  updateNodes(nodes: Endpoint[]): Promise<void>

  getTraffic(): Promise<TrafficStats>

  getLogs(): AsyncIterator<string>

  setTun(enable: boolean): Promise<void>

  testLatency(nodeId: string): Promise<number>
}
```

---

# MihomoAdapter

内部：

```txt id="0n0fli"
Endpoint[]
  ↓
生成 runtime.yaml
  ↓
REST API
```

---

# SingBoxAdapter

内部：

```txt id="z7g8dr"
Endpoint[]
  ↓
生成 config.json
  ↓
调用 sing-box api
```

---

# XrayAdapter

内部：

```txt id="gtmujl"
Endpoint[]
  ↓
生成 xray config
```

---

# 六、配置生成器

# Config Generator

推荐：

```txt id="jswn4u"
config/
├── mihomo/
├── singbox/
├── xray/
```

每个：

```txt id="uqafsz"
Endpoint[]
  ↓
runtime config
```

不要存完整 config。

---

# 七、数据库设计（非常重要）

推荐：

# SQLite

因为：

* 跨平台
* Tauri 友好
* Rust 好支持
* 不需要服务

推荐：

* SQLite
* Rust:

  * sqlx
  * rusqlite

---

# 推荐表结构

## subscriptions

```sql id="mlrmz5"
CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  name TEXT,
  type TEXT,
  url TEXT,
  enabled INTEGER,
  auto_update INTEGER,
  update_interval INTEGER,
  last_updated_at INTEGER
);
```

---

## endpoints

```sql id="j7s5ns"
CREATE TABLE endpoints (
  id TEXT PRIMARY KEY,
  source_id TEXT,
  name TEXT,
  protocol TEXT,
  server TEXT,
  port INTEGER,
  raw_json TEXT
);
```

---

## app_state

```sql id="1vj3ut"
CREATE TABLE app_state (
  key TEXT PRIMARY KEY,
  value TEXT
);
```

例如：

```txt id="0i9u4v"
current_node
current_core
tun_enabled
```

---

# 八、页面结构设计

# 推荐页面结构

```txt id="g3zgwv"
首页
节点页
订阅页
连接页
日志页
设置页
```

---

# 九、首页（最重要）

# 核心原则：

# 用户不应该看到技术概念。

只看到：

```txt id="77g7ca"
已连接
东京节点
延迟 82ms
上传/下载速度
```

---

# 推荐布局

```txt id="6cwy0h"
┌──────────────────┐
│   Connected      │
│   Japan Tokyo    │
│   82ms           │
│                  │
│   [ Disconnect ] │
└──────────────────┘

实时流量图

最近节点

快速切换
```

---

# 十、节点页面

推荐：

```txt id="6ggg91"
搜索
筛选
收藏
国家分组
延迟排序
```

但：

# 不暴露 Proxy Group

---

# 十一、连接模式设计（非常关键）

不要：

```txt id="z6mbt3"
Rule / Global / Direct
```

用户不理解。

推荐：

| UI名称 | 内部实现   |
| ---- | ------ |
| 智能模式 | rule   |
| 全局代理 | global |
| 直连模式 | direct |

---

# 十二、核心交互设计

# 用户连接流程

```txt id="pv54d7"
点击节点
    ↓
连接动画
    ↓
状态:
Connecting
    ↓
Connected
```

不要：

```txt id="8ur3sa"
reload config...
switching group...
```

---

# 十三、状态机（极重要）

```txt id="bdnspg"
Disconnected
Connecting
Connected
Testing
Switching
Reconnecting
Error
```

UI 所有状态围绕这个。

---

# 十四、日志系统

推荐：

```txt id="sp3c79"
实时日志流
```

支持：

* 过滤
* 搜索
* 导出

---

# 十五、TUN 管理

独立模块：

```txt id="p3v4gr"
TunManager
```

统一：

* Windows Wintun
* macOS utun
* Linux tun

UI 不感知。

---

# 十六、多内核策略（重要）

不要：

```txt id="ejt1vi"
让用户手动选择内核
```

推荐：

# Auto Core Strategy

例如：

| 协议            | 内核       |
| ------------- | -------- |
| hysteria2     | sing-box |
| tuic          | sing-box |
| vmess         | xray     |
| clash profile | mihomo   |

用户无感知。

---

# 十七、未来高级功能

# 1. 智能路由

```txt id="xvyxju"
OpenAI → US节点
YouTube → HK节点
Game → JP节点
```

---

# 2. 自动最优节点

后台：

```txt id="k4uz80"
latency benchmark
```

---

# 3. 网络质量评分

```txt id="5vbgxj"
延迟
丢包
抖动
下载速度
```

---

# 4. Workspace

例如：

```txt id="zc9bo2"
工作
游戏
AI
Streaming
```

实际上：

```txt id="1s9nkr"
不同规则+节点策略
```

---

# 十八、技术栈推荐

## UI

推荐：

* React
* Vue
* Svelte

都行。

但：

# 状态管理要强。

推荐：

* Zustand
* Pinia

---

# Rust 后端

推荐：

| 功能     | 库             |
| ------ | ------------- |
| DB     | sqlx          |
| HTTP   | reqwest       |
| async  | tokio         |
| config | serde         |
| IPC    | tauri command |

---

# 十九、目录结构推荐

```txt id="t8ewkt"
src-tauri/
├── core/
├── adapters/
├── subscriptions/
├── config/
├── runtime/
├── tun/
├── dns/
├── storage/
├── traffic/
└── ipc/
```

---

# 二十、你真正的核心竞争力

不是：

```txt id="ng1boq"
支持多少协议
```

而是：

# 统一抽象能力。

未来协议会一直变。

但：

* 连接状态
* 网络体验
* 自动切换
* TUN
* DNS
* 节点管理

这些不会变。

---

# 最后的关键建议

你现在的方向：

# “用户无分组”

一定要坚持。

因为：

# 分组是内核概念。

不是用户概念。

真正现代化的代理客户端：

```txt id="6ikx2e"
用户只理解：
连接
节点
地区
模式
网络状态
```

这才是正确方向。
