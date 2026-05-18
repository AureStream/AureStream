# AureStream 技术设计文档 & 开发计划 v3

> **项目定位**：统一代理运行时平台（Universal Proxy Runtime Platform）
> **当前分支**：`dev`（基于 `origin/master`）
> **核心技术栈**：Tauri 2 + React + Rust + SQLite (sqlx) + tracing + Mihomo

---

## 一、产品愿景与核心原则

AureStream 不是 "Clash GUI"，而是**统一代理运行时平台**。

| 原则 | 说明 |
|------|------|
| **UI 不感知内核** | UI 只感知：连接状态、节点、地区、延迟、模式、网络状态 |
| **数据库是主数据** | SQLite 存储一切，内核配置 runtime generated |
| **Universal Endpoint** | 所有东西 → Endpoint，而不是 → Mihomo Config |
| **两阶段解析** | FormatParser → RawProxyNode → ProtocolParser → Endpoint |
| **Adapter 模式** | CoreAdapter trait 抽象内核，通过 RuntimeProfile 驱动 |
| **事件驱动** | AppEvent 事件总线解耦模块间通信 |

---

## 二、系统架构

```
┌─────────────────────────────┐
│       Tauri UI (React)      │
│    Zustand + IPC Commands   │
└─────────────┬───────────────┘
              │ IPC
┌─────────────▼───────────────┐
│       IPC 薄层 (ipc/)        │
└─────────────┬───────────────┘
              │
┌─────────────▼───────────────┐
│   RuntimeManager (编排层)     │
│  ┌─────────────────────────┐│
│  │ StateMachine            ││
│  │ CoreManager             ││
│  │ ProxyManager            ││
│  │ SessionManager          ││
│  │ TunManager              ││
│  └─────────────────────────┘│
└──────┬──────────┬───────────┘
       │          │
┌──────▼─────┐ ┌──▼──────────┐
│ 订阅引擎    │ │ CoreAdapter │
│ Fetcher    │ │ ┌─────────┐ │
│ FormatParser│ │ │ Mihomo │ │
│ ProtocolParser│ │ └─────┘ │
│ Normalizer │ │ ┌─────────┐ │
│ Registry   │ │ │sing-box│ │
└──────┬─────┘ │ │ (未来)  │ │
┌──────▼─────┐ │ └─────────┘ │
│  SQLite    │ └─────────────┘
│  storage/  │
└────────────┘
     ↕ AppEvent Bus
```

---

## 三、目录结构

```
src-tauri/src/
├── main.rs
├── lib.rs
├── error.rs                       # AppError (thiserror)
│
├── models/
│   ├── endpoint.rs                # Endpoint + Protocol + Auth + Transport
│   ├── subscription.rs            # Subscription + SubscriptionType + Health
│   ├── state.rs                   # ConnectionState 状态机
│   ├── runtime.rs                 # RuntimeProfile + RuntimeSession + RuntimePolicy
│   └── event.rs                   # AppEvent 事件总线定义
│
├── storage/
│   ├── database.rs                # SqlitePool + migrations
│   ├── endpoint_repo.rs           # endpoints CRUD
│   ├── subscription_repo.rs       # subscriptions CRUD
│   └── app_state_repo.rs          # app_state KV
│
├── subscription/
│   ├── fetcher.rs                 # HTTP 拉取 (重试/ETag/base64/gzip)
│   ├── format/                    # Format Parsers → RawProxyNode[]
│   │   ├── mod.rs                 # FormatParser trait
│   │   ├── clash.rs               # ClashYamlParser
│   │   ├── v2ray.rs               # V2rayBase64Parser
│   │   └── singbox.rs             # (未来)
│   ├── protocol/                  # Protocol Parsers → Endpoint
│   │   ├── mod.rs                 # ProtocolParser trait
│   │   ├── vmess.rs
│   │   ├── vless.rs
│   │   ├── shadowsocks.rs
│   │   ├── trojan.rs
│   │   └── hysteria2.rs           # (Phase 2)
│   ├── registry.rs                # ParserRegistry (格式+协议注册)
│   ├── normalizer.rs              # 地区推测 / metadata 补全
│   ├── deduplicator.rs            # unique_hash 去重
│   └── cache.rs                   # 订阅缓存层 (防丢失)
│
├── adapter/
│   ├── mod.rs                     # CoreAdapter trait
│   └── mihomo/
│       ├── adapter.rs             # MihomoAdapter impl CoreAdapter
│       ├── config_gen.rs          # RuntimeProfile → runtime.yaml
│       ├── api_client.rs          # REST API
│       └── constants.rs
│
├── runtime/                       # 🧠 运行时编排 (拆分后的 ConnectionManager)
│   ├── mod.rs                     # RuntimeManager 门面
│   ├── state_machine.rs           # ConnectionState 状态转换
│   ├── core_manager.rs            # 内核生命周期
│   ├── proxy_manager.rs           # 系统代理设置/清理
│   ├── session_manager.rs         # RuntimeSession 管理
│   └── event_bus.rs               # AppEvent 广播
│
├── network/                       # 🌐 网络管理 (统一抽象)
│   ├── system_proxy/
│   │   ├── macos.rs
│   │   ├── windows.rs
│   │   └── linux.rs
│   ├── tun/                       # (未来)
│   ├── dns/                       # (未来)
│   └── routing/                   # (未来)
│
├── ipc/
│   ├── connection_commands.rs
│   ├── subscription_commands.rs
│   ├── node_commands.rs
│   ├── settings_commands.rs
│   └── tray_commands.rs
│
└── util/
    └── port.rs
```

---

## 四、核心数据模型

### 4.1 Endpoint（统一节点模型）

```rust
pub struct Endpoint {
    pub id: String,
    pub name: String,
    pub protocol: Protocol,
    pub server: String,
    pub port: u16,
    pub udp: bool,
    pub tls: bool,
    pub network: Option<TransportNetwork>,
    pub auth: AuthInfo,
    pub transport: TransportInfo,
    pub metadata: EndpointMetadata,
    pub source_id: String,
    pub unique_hash: String,              // 连接语义哈希（见下方说明）
    pub raw: Option<serde_json::Value>,   // 原始数据备份（机场魔改字段）
}

pub enum Protocol { Ss, Vmess, Vless, Trojan, Tuic, Hysteria2, Socks5, Http }
pub enum TransportNetwork { Tcp, Ws, Grpc, Http2, Quic }

pub struct AuthInfo {
    pub uuid: Option<String>,
    pub password: Option<String>,
    pub method: Option<String>,
    pub token: Option<String>,
}

pub struct TransportInfo {
    pub host: Option<String>,
    pub path: Option<String>,
    pub sni: Option<String>,
    pub alpn: Option<Vec<String>>,
    pub fingerprint: Option<String>,
    pub skip_cert_verify: Option<bool>,
}

pub struct EndpointMetadata {
    pub country: Option<String>,
    pub city: Option<String>,
    pub provider: Option<String>,
    pub latency: Option<u32>,
    pub tags: Option<Vec<String>>,
}
```

### 4.2 RawProxyNode（两阶段解析中间层 — 带标准化契约）

> **关键设计**：RawProxyNode 不能是"垃圾桶结构"。FormatParser 必须提取出 `CanonicalFields`（标准化契约字段），
> 这样 ProtocolParser 不再需要做 format-specific fallback，直接读取契约字段即可。

```rust
/// FormatParser 输出 → ProtocolParser 输入
pub struct RawProxyNode {
    pub protocol: Protocol,            // 使用 enum，不是 String
    pub source_format: SourceFormat,   // Clash / V2ray / SingBox / Surge
    pub canonical: CanonicalFields,    // ⭐ 标准化契约层（FormatParser 必须填充）
    pub extra: serde_json::Value,      // 格式特有的非标准字段（机场魔改等）
}

pub enum SourceFormat { Clash, V2ray, SingBox, Surge, Sip008 }

/// 标准化契约：FormatParser 负责从各格式提取这些字段
/// ProtocolParser 只读取 canonical + extra，不再"猜字段"
pub struct CanonicalFields {
    pub server: String,
    pub port: u16,
    pub auth: AuthInfo,
    pub transport: TransportInfo,
    pub tls: bool,
    pub udp: bool,
    pub name: String,
}
```

> **为什么需要 CanonicalFields？** 不同格式对同一字段的命名完全不同：
> | 格式 | WebSocket Path |
> |------|----------------|
> | Clash | `ws-opts.path` |
> | sing-box | `transport.path` |
> | V2Ray URI | `path` query param |
>
> FormatParser 负责将这些差异统一到 `canonical.transport.path`，ProtocolParser 只读这一个位置。

### 4.2.1 unique_hash 计算规则

> **连接语义哈希**，而非简单的 server+port+auth。

```rust
// unique_hash = SHA256(protocol + server + port + uuid/password + transport.host + transport.path + transport.sni)
// 本质：相同的 unique_hash 意味着"连接到的是同一个出口"
fn compute_unique_hash(ep: &Endpoint) -> String {
    let mut hasher = Sha256::new();
    hasher.update(ep.protocol.as_str());
    hasher.update(&ep.server);
    hasher.update(ep.port.to_string());
    hasher.update(ep.auth.uuid.as_deref().unwrap_or(""));
    hasher.update(ep.auth.password.as_deref().unwrap_or(""));
    hasher.update(ep.transport.host.as_deref().unwrap_or(""));
    hasher.update(ep.transport.path.as_deref().unwrap_or(""));
    hasher.update(ep.transport.sni.as_deref().unwrap_or(""));
    hex::encode(hasher.finalize())
}
```

### 4.3 RuntimeProfile & RuntimeSession

```rust
/// 传递给 CoreAdapter 的运行时描述，CoreAdapter 不依赖 UI 概念
pub struct RuntimeProfile {
    pub endpoints: Vec<Endpoint>,
    pub selected_node_id: Option<String>,
    pub policy: RuntimePolicy,
    pub dns: DnsProfile,
    pub tun: TunProfile,
    pub listen: String,
    pub mixed_port: u16,
}

/// 路由策略：不绑定任何内核语义，Adapter 内部负责映射
pub struct RuntimePolicy {
    pub routing_mode: RoutingMode,
    pub outbound_strategy: OutboundStrategy,
}

pub enum RoutingMode {
    RuleBased,     // 按规则路由（Mihomo → rule, sing-box → route rules）
    FullTunnel,    // 全部走代理（Mihomo → global, sing-box → disable direct）
    Direct,        // 全部直连
}

pub enum OutboundStrategy {
    Selected(String),          // 手动选择节点 ID
    AutoBest,                  // 自动选择最优延迟
    Fallback(Vec<String>),     // 故障转移链
}

/// 当前运行会话（支持未来故障转移、多 profile）
pub struct RuntimeSession {
    pub session_id: String,
    pub current_node_id: Option<String>,
    pub current_core: String,      // "mihomo" / "singbox"
    pub policy: RuntimePolicy,
    pub started_at: i64,
}
```

### 4.4 ConnectionState 状态机

```rust
pub enum ConnectionState {
    Disconnected, Connecting, Connected, Testing, Switching, Reconnecting, Error,
}
```

### 4.5 AppEvent 事件总线（分级双通道）

> **关键设计**：事件分为 control（低频）和 telemetry（高频）两个通道，
> 避免 traffic/latency 高频事件淹没状态变更等关键事件。

```rust
pub enum AppEvent {
    // ── Control Channel（低频，Critical/Normal 优先级）──
    ConnectionStateChanged(ConnectionState),
    SubscriptionUpdated { id: String },
    CoreStarted { core_type: String },
    CoreStopped,
    Error(String),

    // ── Telemetry Channel（高频，独立 channel 消费）──
    TrafficUpdated { upload: u64, download: u64 },
    NodeLatencyTested { node_id: String, latency: Option<u32> },
    CoreLog(String),
}

impl AppEvent {
    pub fn is_telemetry(&self) -> bool {
        matches!(self, Self::TrafficUpdated { .. } | Self::NodeLatencyTested { .. } | Self::CoreLog(_))
    }
}
```

```rust
/// EventBus 内部使用双 channel
pub struct EventBus {
    control_tx: broadcast::Sender<AppEvent>,     // 低频，UI 状态驱动
    telemetry_tx: broadcast::Sender<AppEvent>,   // 高频，可丢弃旧数据
    app_handle: AppHandle,                       // Tauri emit 到前端
}
```

---

## 五、数据库设计（SQLite + sqlx）

### Migration: `001_init.sql`

```sql
CREATE TABLE IF NOT EXISTS subscriptions (
    id               TEXT PRIMARY KEY NOT NULL,
    name             TEXT NOT NULL,
    sub_type         TEXT NOT NULL DEFAULT 'clash',
    url              TEXT NOT NULL,
    enabled          INTEGER NOT NULL DEFAULT 1,
    auto_update      INTEGER NOT NULL DEFAULT 0,
    update_interval  INTEGER NOT NULL DEFAULT 3600,
    last_updated_at  INTEGER,
    node_count       INTEGER NOT NULL DEFAULT 0,
    health_status    TEXT NOT NULL DEFAULT 'ok',
    health_message   TEXT,
    traffic_upload   INTEGER,
    traffic_download INTEGER,
    traffic_total    INTEGER,
    expire_at        INTEGER,
    -- 三层订阅缓存
    last_success_raw BLOB,       -- Layer 1: HTTP 原始响应 (gzip 压缩)
    parsed_cache     TEXT,       -- Layer 2: RawProxyNode[] JSON 序列化
    last_success_at  INTEGER,
    created_at       INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at       INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS endpoints (
    id             TEXT PRIMARY KEY NOT NULL,
    source_id      TEXT NOT NULL,
    name           TEXT NOT NULL,
    protocol       TEXT NOT NULL,
    server         TEXT NOT NULL,
    port           INTEGER NOT NULL,
    udp            INTEGER NOT NULL DEFAULT 0,
    tls            INTEGER NOT NULL DEFAULT 0,
    network        TEXT,
    auth_json      TEXT NOT NULL DEFAULT '{}',
    transport_json TEXT NOT NULL DEFAULT '{}',
    metadata_json  TEXT NOT NULL DEFAULT '{}',
    raw_json       TEXT,
    unique_hash    TEXT NOT NULL,       -- server+port+auth 哈希，去重依据
    favorite       INTEGER NOT NULL DEFAULT 0,
    last_used_at   INTEGER,
    created_at     INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (source_id) REFERENCES subscriptions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_endpoints_source ON endpoints(source_id);
CREATE INDEX IF NOT EXISTS idx_endpoints_protocol ON endpoints(protocol);
CREATE INDEX IF NOT EXISTS idx_endpoints_server_port ON endpoints(server, port);
CREATE INDEX IF NOT EXISTS idx_endpoints_unique_hash ON endpoints(unique_hash);
CREATE INDEX IF NOT EXISTS idx_endpoints_favorite ON endpoints(favorite) WHERE favorite = 1;

CREATE TABLE IF NOT EXISTS app_state (
    key   TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
);

INSERT OR IGNORE INTO app_state (key, value) VALUES
    ('connection_state', '"disconnected"'),
    ('current_node_id', '""'),
    ('current_subscription_id', '""'),
    ('runtime_policy', '"smart_routing"'),
    ('theme', '"light"'),
    ('auto_start', 'false'),
    ('auto_connect', 'false'),
    ('proxy_bypass_domains', '"localhost,127.*,10.*,172.16.*,192.168.*,<local>"');
```

---

## 六、两阶段解析系统（最核心改进）

```
URL → Fetcher → raw bytes
                   ↓
          Format Detector (自动识别)
                   ↓
     ┌─────────────┼─────────────┐
     ▼             ▼             ▼
ClashParser   V2rayParser   SingBoxParser
     │             │             │
     └──────┬──────┴─────────────┘
            ▼
     RawProxyNode[] (中间层)
            ↓
  ┌─────────┼──────────┐
  ▼         ▼          ▼
VmessP   VlessP    TrojanP  ...  (ProtocolParser)
  │         │          │
  └────┬────┴──────────┘
       ▼
  Endpoint[] (统一模型)
       ↓
  Normalizer (country/city)
       ↓
  Deduplicator (unique_hash)
       ↓
  Cache + Storage (SQLite)
```

### FormatParser Trait

```rust
pub trait FormatParser: Send + Sync {
    fn name(&self) -> &str;
    fn can_parse(&self, content: &[u8]) -> bool;
    fn parse(&self, content: &[u8], source_id: &str) -> Result<Vec<RawProxyNode>, AppError>;
}
```

### ProtocolParser Trait

```rust
pub trait ProtocolParser: Send + Sync {
    fn protocol(&self) -> &str;   // "vmess" / "vless" / "ss" ...
    fn parse(&self, raw: &RawProxyNode, source_id: &str) -> Result<Endpoint, AppError>;
}
```

### ParserRegistry

```rust
pub struct ParserRegistry {
    format_parsers: Vec<Box<dyn FormatParser>>,
    protocol_parsers: HashMap<String, Box<dyn ProtocolParser>>,
}

impl ParserRegistry {
    pub fn new() -> Self {
        let mut r = Self::default();
        // Phase 1: 静态注册
        r.register_format(Box::new(ClashYamlParser));
        r.register_format(Box::new(V2rayBase64Parser));
        r.register_protocol(Box::new(VmessParser));
        r.register_protocol(Box::new(VlessParser));
        r.register_protocol(Box::new(ShadowsocksParser));
        r.register_protocol(Box::new(TrojanParser));
        r
    }

    /// 自动检测格式并完成两阶段解析
    pub fn parse_subscription(&self, content: &[u8], source_id: &str)
        -> Result<Vec<Endpoint>, AppError>;
}
```

---

## 七、CoreAdapter Trait（控制面 / 遥测面分离）

> **关键设计**：将 CoreAdapter 拆分为 ControlPlane（控制面）和 TelemetryPlane（遥测面），
> 职责清晰，未来不同内核可独立实现遥测能力。

```rust
/// 控制面：内核生命周期 + 节点/策略切换
#[async_trait]
pub trait CoreControlPlane: Send + Sync {
    async fn start(&self, profile: &RuntimeProfile) -> Result<(), AppError>;
    async fn stop(&self) -> Result<(), AppError>;
    async fn reload(&self, profile: &RuntimeProfile) -> Result<(), AppError>;
    async fn select_node(&self, node_id: &str) -> Result<(), AppError>;
    async fn apply_policy(&self, policy: &RuntimePolicy) -> Result<(), AppError>;
    fn is_running(&self) -> bool;
    fn core_type(&self) -> &str;
}

/// 遥测面：流量监控 + 延迟探测
#[async_trait]
pub trait CoreTelemetryPlane: Send + Sync {
    async fn get_traffic(&self) -> Result<TrafficStats, AppError>;
    async fn test_latency(&self, node_id: &str) -> Result<LatencyResult, AppError>;
    async fn test_all_latency(&self, node_ids: &[String]) -> Result<Vec<LatencyResult>, AppError>;
}

/// 完整适配器 = 控制面 + 遥测面
pub trait CoreAdapter: CoreControlPlane + CoreTelemetryPlane {}
```

---

## 八、RuntimeManager（拆分后的编排层）

```rust
/// 门面：对外暴露简洁 API，内部委托给子管理器
pub struct RuntimeManager {
    state_machine: StateMachine,
    core_manager: CoreManager,
    proxy_manager: ProxyManager,
    session_manager: SessionManager,
    event_bus: EventBus,
    pool: SqlitePool,
}

impl RuntimeManager {
    pub async fn connect(&self, node_id: &str) -> Result<(), AppError>;
    pub async fn disconnect(&self) -> Result<(), AppError>;
    pub async fn switch_node(&self, node_id: &str) -> Result<(), AppError>;
    pub async fn set_policy(&self, policy: RuntimePolicy) -> Result<(), AppError>;
    pub fn state(&self) -> ConnectionState;
    pub fn session(&self) -> Option<RuntimeSession>;
}
```

| 子模块 | 职责 |
|--------|------|
| `StateMachine` | ConnectionState 状态转换与守卫 |
| `CoreManager` | 内核生命周期（start/stop/reload），持有 `Arc<dyn CoreAdapter>` |
| `ProxyManager` | 系统代理设置/清理 |
| `SessionManager` | RuntimeSession 创建/销毁/持久化 |
| `EventBus` | AppEvent 广播（Tauri emit + 内部 channel） |

---

## 九、订阅缓存层（三层缓存架构）

> **关键设计**：明确三层缓存，避免"缓存恢复后解析逻辑变更导致数据不一致"。

```
Layer 1: raw_fetch_cache     → HTTP 原始响应 (BLOB, 可压缩)
Layer 2: parsed_cache        → RawProxyNode[] 序列化 (解析后中间结果)
Layer 3: endpoint_cache      → endpoints 表本身 (最终 Endpoint)
```

```rust
/// 订阅更新流程（三层缓存保护）：
///
/// 1. fetch 新数据 → 写入 Layer 1 (raw_fetch_cache)
/// 2. 解析为 RawProxyNode[] → 写入 Layer 2 (parsed_cache)
/// 3. 协议解析为 Endpoint[] → 写入 Layer 3 (endpoints 表)
/// 4. 全部成功 → 更新 last_success_at 时间戳
///
/// 失败恢复策略：
/// - fetch 失败 → 保留 Layer 3 现有数据，不清空
/// - parse 失败 → 尝试从 Layer 1 (raw_fetch_cache) 重新解析
/// - DB 为空   → 尝试从 Layer 2 (parsed_cache) 恢复
///
/// 这保证了：即使解析逻辑升级导致新版本解析失败，
/// 仍可从 Layer 1 原始数据用旧逻辑恢复。
```

数据库字段对应：
```sql
-- subscriptions 表中
last_success_raw   BLOB,    -- Layer 1: HTTP 原始响应 (gzip 压缩)
parsed_cache       TEXT,    -- Layer 2: RawProxyNode[] JSON 序列化
last_success_at    INTEGER  -- 最后成功时间
```

---

## 十、依赖变更（Cargo.toml）

```toml
# 新增
sqlx = { version = "0.8", features = ["runtime-tokio", "sqlite"] }
async-trait = "0.1"
uuid = { version = "1", features = ["v4"] }
thiserror = "2"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
sha2 = "0.10"                     # unique_hash 计算

# 保留
tauri, serde, serde_json, serde_yaml, reqwest, tokio, chrono, base64

# Phase 5 评估移除
tauri-plugin-store, tauri-plugin-mihomo
```

---

## 十一、关键设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 解析架构 | **两阶段**：FormatParser → RawProxyNode → ProtocolParser → Endpoint | 避免协议逻辑在多个 FormatParser 中重复 |
| 内核接口 | CoreAdapter 接受 **RuntimeProfile** 而非 Endpoint[] | 解耦 UI 概念与内核实现 |
| 模式抽象 | **RuntimePolicy** 替代 Clash rule/global/direct | sing-box 无此概念，Adapter 内部映射 |
| 编排层 | RuntimeManager 拆分为 5 个子管理器 | 避免单文件膨胀至 5000+ 行 |
| 日志 | **tracing** 替代 log | 结构化日志，性能更好，span 追踪 |
| 事件通信 | **AppEvent 事件总线** | 解耦模块间通信，避免 IPC 直调混乱 |
| 订阅安全 | **缓存层保护** | fetch 失败不丢节点 |
| 去重 | **unique_hash** (server+port+auth SHA256) | 独立字段，索引加速 |

---

## 十二、开发计划表

### Phase 1: 基础设施（1 周）

| # | 任务 | 产出 |
|---|------|------|
| 1.1 | 目录骨架 + mod.rs | 全部新目录 |
| 1.2 | `error.rs` — AppError (thiserror) | 统一错误类型 |
| 1.3 | `models/` — Endpoint, RawProxyNode, Subscription, RuntimeProfile, RuntimeSession, RuntimePolicy, ConnectionState, AppEvent | 全部数据模型 |
| 1.4 | Cargo.toml 依赖 | sqlx, async-trait, uuid, thiserror, tracing, sha2 |
| 1.5 | SQLite + Migration | `storage/database.rs`, `migrations/001_init.sql` |
| 1.6 | Repository 层 | endpoint_repo, subscription_repo, app_state_repo |
| 1.7 | tracing 初始化 | 替换现有 log 宏 |

### Phase 2: 订阅引擎（1.5 周）

| # | 任务 | 产出 |
|---|------|------|
| 2.1 | FormatParser trait + ClashYamlParser → RawProxyNode[] | `subscription/format/` |
| 2.2 | V2rayBase64Parser → RawProxyNode[] | `subscription/format/v2ray.rs` |
| 2.3 | ProtocolParser trait + VmessParser, VlessParser, SsParser, TrojanParser | `subscription/protocol/` |
| 2.4 | **ParserRegistry** (静态注册) | `subscription/registry.rs` |
| 2.5 | Normalizer (地区推测) | `subscription/normalizer.rs` |
| 2.6 | Deduplicator (unique_hash) | `subscription/deduplicator.rs` |
| 2.7 | Fetcher + 订阅缓存层 | `subscription/fetcher.rs`, `subscription/cache.rs` |
| 2.8 | 订阅 IPC | `ipc/subscription_commands.rs` |

### Phase 3: 内核适配层（1.5 周）

| # | 任务 | 产出 |
|---|------|------|
| 3.1 | CoreAdapter trait (接受 RuntimeProfile) | `adapter/mod.rs` |
| 3.2 | MihomoConfigGenerator (RuntimeProfile → YAML) | `adapter/mihomo/config_gen.rs` |
| 3.3 | MihomoApiClient | `adapter/mihomo/api_client.rs` |
| 3.4 | MihomoAdapter impl CoreAdapter | `adapter/mihomo/adapter.rs` |
| 3.5 | network/system_proxy 模块化 | `network/system_proxy/` |

### Phase 4: 运行时编排（1.5 周）

| # | 任务 | 产出 |
|---|------|------|
| 4.1 | StateMachine | `runtime/state_machine.rs` |
| 4.2 | CoreManager | `runtime/core_manager.rs` |
| 4.3 | ProxyManager | `runtime/proxy_manager.rs` |
| 4.4 | SessionManager | `runtime/session_manager.rs` |
| 4.5 | EventBus (AppEvent 广播) | `runtime/event_bus.rs` |
| 4.6 | RuntimeManager 门面 | `runtime/mod.rs` |
| 4.7 | 全部 IPC 命令 | `ipc/` 各文件 |

### Phase 5: 集成与切换（1 周）

| # | 任务 | 产出 |
|---|------|------|
| 5.1 | lib.rs 重写 | 新模块替换旧 commands |
| 5.2 | 移除旧代码 | 删除 `commands/`, `config.rs` |
| 5.3 | 前端 API 适配 | `src/lib/`, `src/stores/` |
| 5.4 | 集成测试 | 端到端全流程验证 |
| 5.5 | 移除旧依赖 | tauri-plugin-mihomo, tauri-plugin-store |

---

## 十三、里程碑与工期

| 里程碑 | 工期 | 核心产出 |
|--------|------|---------|
| **M1** | 1 周 | SQLite + 数据模型 + Repository |
| **M2** | 1.5 周 | 两阶段解析引擎 + ParserRegistry + 缓存 |
| **M3** | 1.5 周 | MihomoAdapter + RuntimeProfile 驱动 |
| **M4** | 1.5 周 | RuntimeManager (5 子模块) + EventBus |
| **M5** | 1 周 | 全面切换 + 集成测试 |
| **总计** | **约 6-7 周** | |

> 含 Parser 兼容调试、跨平台系统代理、Mihomo 生命周期管理等复杂度的缓冲。

---

## 十四、未来扩展路线图

| 阶段 | 目标 |
|------|------|
| Phase 6 | Hysteria2/TUIC ProtocolParser + sing-box FormatParser |
| Phase 7 | SingBoxAdapter impl CoreAdapter |
| Phase 8 | TUN/DNS/Routing 模块 (`network/`) |
| Phase 9 | 智能路由、自动最优节点、Workspace |
| Phase 10 | ParserRegistry 动态注册 → WASM 沙箱 Parser |

---

## 十五、现有代码复用清单

| 现有文件 | 复用方式 | 目标 |
|----------|---------|------|
| `commands/subscription.rs` | 提取 HTTP/重定向/base64/header 逻辑 | `subscription/fetcher.rs` |
| `commands/builtin_config.rs` | 提取 config_value 生成逻辑 | `adapter/mihomo/config_gen.rs` |
| `commands/mihomo_kernel.rs` | 提取 sidecar/geodata 逻辑 | `adapter/mihomo/adapter.rs` |
| `commands/system_proxy.rs` | 拆分平台文件 | `network/system_proxy/` |
| `commands/proxy.rs` | 由 RuntimeManager + DB 替代 | `runtime/` |
| `config.rs` | 由 SQLite app_state 替代 | `storage/app_state_repo.rs` |

---

> **迁移策略**：Phase 1-4 新旧并存，每阶段可独立编译测试。Phase 5 一次性切换。
