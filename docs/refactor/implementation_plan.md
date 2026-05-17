# AureStream 后端重构实现计划

> 基于 [refactor.md](./refactor.md) 设计文档，将后端从"Clash GUI"重构为**统一代理运行时平台（Universal Proxy Runtime Platform）**。

---

## 一、核心设计原则

| 原则 | 说明 |
|------|------|
| **数据库是主数据** | SQLite（sqlx）存储所有 Endpoint、Subscription、AppState，内核配置 **runtime generated** |
| **UI 不感知内核** | IPC 层只暴露：连接、节点、地区、延迟、模式、网络状态 |
| **Adapter 模式** | `CoreAdapter` trait 抽象内核操作，先实现 `MihomoAdapter`，后续可插拔 sing-box / xray |
| **低耦合高内聚** | 每个模块职责单一，模块间通过 trait / 接口通信 |

---

## 二、新目录结构

```
src-tauri/src/
├── main.rs                    # 入口（不变）
├── lib.rs                     # Tauri Builder 组装（精简）
├── error.rs                   # 统一错误类型 AppError
│
├── models/                    # 📦 统一数据模型（Pure Data）
│   ├── mod.rs
│   ├── endpoint.rs            # Endpoint 结构体
│   ├── subscription.rs        # Subscription 结构体
│   └── state.rs               # ConnectionState 状态机 + AppState KV
│
├── storage/                   # 💾 SQLite 持久化层
│   ├── mod.rs
│   ├── database.rs            # SqlitePool 初始化 + migrations
│   ├── endpoint_repo.rs       # endpoints CRUD
│   ├── subscription_repo.rs   # subscriptions CRUD
│   └── app_state_repo.rs      # app_state KV CRUD
│
├── subscription/              # 📡 订阅引擎
│   ├── mod.rs
│   ├── fetcher.rs             # HTTP 拉取（重试、ETag、base64）
│   ├── parser.rs              # 多格式解析 → Endpoint[]
│   ├── normalizer.rs          # URI 协议归一化
│   └── deduplicator.rs        # server+port+auth 去重
│
├── adapter/                   # 🔌 内核适配层
│   ├── mod.rs                 # CoreAdapter trait 定义
│   ├── mihomo/                # Mihomo 适配器
│   │   ├── mod.rs
│   │   ├── adapter.rs         # MihomoAdapter impl CoreAdapter
│   │   ├── config_gen.rs      # Endpoint[] → runtime.yaml
│   │   ├── api_client.rs      # Mihomo REST API 客户端
│   │   └── constants.rs       # Mihomo 特定常量
│   ├── singbox/               # 🔮 未来扩展
│   └── xray/                  # 🔮 未来扩展
│
├── core/                      # 🧠 核心业务编排层
│   ├── mod.rs
│   ├── connection_manager.rs  # 连接状态机 + 编排
│   ├── node_selector.rs       # 节点选择 / 收藏 / 筛选
│   └── traffic_monitor.rs     # 流量监控
│
├── system_proxy/              # 🖥️ 系统代理（基本复用现有）
│   ├── mod.rs
│   ├── macos.rs
│   ├── windows.rs
│   └── linux.rs
│
├── ipc/                       # 🔗 Tauri IPC Commands（薄层）
│   ├── mod.rs
│   ├── connection_commands.rs # 连接/断开/状态
│   ├── subscription_commands.rs # 订阅 CRUD / 更新
│   ├── node_commands.rs       # 节点列表/筛选/测速
│   ├── settings_commands.rs   # 应用设置
│   └── tray_commands.rs       # 托盘菜单
│
└── util/                      # 🔧 工具函数
    ├── mod.rs
    └── port.rs                # 端口分配等
```

---

## 三、统一数据模型

### 3.1 Endpoint（统一节点模型）

```rust
// models/endpoint.rs

#[derive(Debug, Clone, Serialize, Deserialize)]
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
    pub source_id: String,       // 关联 Subscription.id
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Protocol {
    Ss, Vmess, Vless, Trojan, Tuic, Hysteria2, Socks5, Http,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TransportNetwork {
    Tcp, Ws, Grpc, Http2, Quic,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AuthInfo {
    pub uuid: Option<String>,
    pub password: Option<String>,
    pub method: Option<String>,     // SS 加密方式
    pub token: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TransportInfo {
    pub host: Option<String>,
    pub path: Option<String>,
    pub sni: Option<String>,
    pub alpn: Option<Vec<String>>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct EndpointMetadata {
    pub country: Option<String>,
    pub city: Option<String>,
    pub provider: Option<String>,
    pub latency: Option<u32>,
    pub tags: Option<Vec<String>>,
}
```

### 3.2 Subscription（订阅模型）

```rust
// models/subscription.rs

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Subscription {
    pub id: String,
    pub name: String,
    pub sub_type: SubscriptionType,
    pub url: String,
    pub enabled: bool,
    pub auto_update: bool,
    pub update_interval: i64,       // 秒
    pub last_updated_at: Option<i64>, // Unix timestamp
    pub node_count: i32,
    pub health_status: HealthStatus,
    pub health_message: Option<String>,
    // 流量信息
    pub traffic_upload: Option<i64>,
    pub traffic_download: Option<i64>,
    pub traffic_total: Option<i64>,
    pub expire_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SubscriptionType {
    Clash, V2ray, SingBox, Surge, Sip008,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HealthStatus {
    Ok, Error, Expired,
}
```

### 3.3 ConnectionState（连接状态机）

```rust
// models/state.rs

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ConnectionState {
    Disconnected,
    Connecting,
    Connected,
    Testing,
    Switching,
    Reconnecting,
    Error,
}

/// 连接模式（UI 友好名称映射内核模式）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProxyMode {
    Smart,    // → rule
    Global,   // → global
    Direct,   // → direct
}
```

---

## 四、SQLite 数据库设计（sqlx）

### 4.1 Migrations

```sql
-- migrations/001_init.sql

CREATE TABLE IF NOT EXISTS subscriptions (
    id              TEXT PRIMARY KEY NOT NULL,
    name            TEXT NOT NULL,
    sub_type        TEXT NOT NULL DEFAULT 'clash',
    url             TEXT NOT NULL,
    enabled         INTEGER NOT NULL DEFAULT 1,
    auto_update     INTEGER NOT NULL DEFAULT 0,
    update_interval INTEGER NOT NULL DEFAULT 3600,
    last_updated_at INTEGER,
    node_count      INTEGER NOT NULL DEFAULT 0,
    health_status   TEXT NOT NULL DEFAULT 'ok',
    health_message  TEXT,
    traffic_upload  INTEGER,
    traffic_download INTEGER,
    traffic_total   INTEGER,
    expire_at       INTEGER,
    created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS endpoints (
    id          TEXT PRIMARY KEY NOT NULL,
    source_id   TEXT NOT NULL,
    name        TEXT NOT NULL,
    protocol    TEXT NOT NULL,
    server      TEXT NOT NULL,
    port        INTEGER NOT NULL,
    udp         INTEGER NOT NULL DEFAULT 0,
    tls         INTEGER NOT NULL DEFAULT 0,
    network     TEXT,
    auth_json   TEXT NOT NULL DEFAULT '{}',
    transport_json TEXT NOT NULL DEFAULT '{}',
    metadata_json  TEXT NOT NULL DEFAULT '{}',
    raw_json    TEXT,                         -- 原始解析数据备份
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (source_id) REFERENCES subscriptions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_endpoints_source ON endpoints(source_id);
CREATE INDEX IF NOT EXISTS idx_endpoints_protocol ON endpoints(protocol);
CREATE INDEX IF NOT EXISTS idx_endpoints_server_port ON endpoints(server, port);

CREATE TABLE IF NOT EXISTS app_state (
    key   TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
);

-- 预置默认状态
INSERT OR IGNORE INTO app_state (key, value) VALUES
    ('connection_state', '"disconnected"'),
    ('current_node_id', '""'),
    ('current_subscription_id', '""'),
    ('proxy_mode', '"smart"'),
    ('theme', '"light"'),
    ('auto_start', 'false'),
    ('auto_connect', 'false'),
    ('proxy_bypass_domains', '"localhost,127.*,10.*,172.16.*,192.168.*,<local>"');
```

### 4.2 Database 初始化

```rust
// storage/database.rs

use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;
use std::path::Path;

pub async fn init_database(db_path: &Path) -> Result<SqlitePool, sqlx::Error> {
    let options = SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(true)
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
        .foreign_keys(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await?;

    // Run embedded migrations
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await?;

    Ok(pool)
}
```

---

## 五、CoreAdapter Trait（内核适配层）

```rust
// adapter/mod.rs

use crate::models::endpoint::Endpoint;
use async_trait::async_trait;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrafficStats {
    pub upload_bytes: u64,
    pub download_bytes: u64,
    pub upload_speed: u64,     // bytes/s
    pub download_speed: u64,   // bytes/s
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LatencyResult {
    pub node_id: String,
    pub latency: Option<u32>,  // ms
    pub error: Option<String>,
}

#[async_trait]
pub trait CoreAdapter: Send + Sync {
    /// 启动内核进程
    async fn start(&self, endpoints: &[Endpoint]) -> Result<(), crate::error::AppError>;

    /// 停止内核进程
    async fn stop(&self) -> Result<(), crate::error::AppError>;

    /// 重载配置（热更新节点列表）
    async fn reload(&self, endpoints: &[Endpoint]) -> Result<(), crate::error::AppError>;

    /// 连接到指定节点
    async fn connect(&self, node_id: &str) -> Result<(), crate::error::AppError>;

    /// 断开当前连接
    async fn disconnect(&self) -> Result<(), crate::error::AppError>;

    /// 获取实时流量统计
    async fn get_traffic(&self) -> Result<TrafficStats, crate::error::AppError>;

    /// 测试单个节点延迟
    async fn test_latency(&self, node_id: &str) -> Result<LatencyResult, crate::error::AppError>;

    /// 批量测试节点延迟
    async fn test_all_latency(&self, node_ids: &[String])
        -> Result<Vec<LatencyResult>, crate::error::AppError>;

    /// 设置代理模式（rule/global/direct）
    async fn set_mode(&self, mode: &str) -> Result<(), crate::error::AppError>;

    /// 内核是否正在运行
    fn is_running(&self) -> bool;

    /// 内核类型标识
    fn core_type(&self) -> &str;
}
```

---

## 六、MihomoAdapter 实现

### 6.1 核心结构

```rust
// adapter/mihomo/adapter.rs

pub struct MihomoAdapter {
    app_handle: AppHandle,
    child: Arc<Mutex<Option<CommandChild>>>,
    api_client: MihomoApiClient,
    config_gen: MihomoConfigGenerator,
    running: AtomicBool,
    mixed_port: AtomicU16,
}
```

### 6.2 配置生成器

```rust
// adapter/mihomo/config_gen.rs
// Endpoint[] → runtime YAML (动态生成，不持久化主配置)

pub struct MihomoConfigGenerator;

impl MihomoConfigGenerator {
    /// 将 Endpoint[] 转换为 Mihomo 可识别的 proxy 格式
    pub fn endpoints_to_proxies(endpoints: &[Endpoint]) -> Vec<serde_yaml::Value> { ... }

    /// 生成完整 runtime.yaml
    pub fn generate(
        endpoints: &[Endpoint],
        listen: &str,
        mixed_port: u16,
        mode: &str,
    ) -> Result<String, AppError> { ... }
}
```

### 6.3 REST API Client

```rust
// adapter/mihomo/api_client.rs

pub struct MihomoApiClient {
    base_url: String,        // http://127.0.0.1:9090
    client: reqwest::Client,
}

impl MihomoApiClient {
    pub async fn get_version(&self) -> Result<String, AppError> { ... }
    pub async fn get_traffic(&self) -> Result<TrafficStats, AppError> { ... }
    pub async fn switch_proxy(&self, group: &str, name: &str) -> Result<(), AppError> { ... }
    pub async fn test_delay(&self, name: &str, url: &str, timeout: u32)
        -> Result<u32, AppError> { ... }
    pub async fn set_mode(&self, mode: &str) -> Result<(), AppError> { ... }
}
```

---

## 七、订阅引擎 Pipeline

```
URL → Fetcher → raw bytes
                    ↓
            Parser (Clash YAML / V2Ray Base64 / ...)
                    ↓
              Endpoint[] (raw)
                    ↓
              Normalizer (补全 country/city 等 metadata)
                    ↓
              Deduplicator (server+port+uuid 去重)
                    ↓
              Storage (写入 SQLite endpoints 表)
```

### 7.1 Parser Trait

```rust
// subscription/parser.rs

pub trait SubscriptionParser: Send + Sync {
    fn can_parse(&self, content: &[u8]) -> bool;
    fn parse(&self, content: &[u8], source_id: &str) -> Result<Vec<Endpoint>, AppError>;
}

pub struct ClashYamlParser;
pub struct V2rayBase64Parser;
// 未来: SingBoxJsonParser, SurgeParser, Sip008Parser
```

---

## 八、核心编排层 ConnectionManager

```rust
// core/connection_manager.rs

pub struct ConnectionManager {
    pool: SqlitePool,
    adapter: Arc<dyn CoreAdapter>,
    state: Arc<RwLock<ConnectionState>>,
    system_proxy_managed: AtomicBool,
}

impl ConnectionManager {
    /// 完整连接流程：
    /// 1. 从 DB 读取当前订阅的全部 Endpoint
    /// 2. 调用 adapter.start(endpoints) 生成配置并启动内核
    /// 3. 调用 adapter.connect(node_id) 选择节点
    /// 4. 设置系统代理
    /// 5. 更新 ConnectionState → Connected
    pub async fn connect(&self, node_id: &str) -> Result<(), AppError> { ... }

    /// 断开流程：反向清理
    pub async fn disconnect(&self) -> Result<(), AppError> { ... }

    /// 切换节点（不重启内核）
    pub async fn switch_node(&self, node_id: &str) -> Result<(), AppError> { ... }

    /// 获取当前状态
    pub fn state(&self) -> ConnectionState { ... }
}
```

---

## 九、IPC 层（Tauri Commands — 薄层）

```rust
// ipc/connection_commands.rs

#[tauri::command]
pub async fn connect(
    pool: State<'_, SqlitePool>,
    manager: State<'_, ConnectionManager>,
    node_id: String,
) -> Result<ConnectionState, String> {
    manager.connect(&node_id).await.map_err(|e| e.to_string())?;
    Ok(manager.state())
}

#[tauri::command]
pub async fn disconnect(
    manager: State<'_, ConnectionManager>,
) -> Result<ConnectionState, String> {
    manager.disconnect().await.map_err(|e| e.to_string())?;
    Ok(manager.state())
}

#[tauri::command]
pub async fn get_connection_state(
    manager: State<'_, ConnectionManager>,
) -> Result<ConnectionState, String> {
    Ok(manager.state())
}
```

---

## 十、实施阶段规划

### Phase 1: 基础设施
- [ ] 新目录结构搭建
- [ ] `error.rs` — 统一错误类型
- [ ] `models/` — 全部数据模型
- [ ] `storage/` — SQLite + sqlx 初始化 + 3 张表 + Repository
- [ ] `util/` — 端口分配等工具

### Phase 2: 订阅引擎
- [ ] `subscription/fetcher.rs` — HTTP 拉取（复用现有 download_subscription 逻辑）
- [ ] `subscription/parser.rs` — ClashYamlParser（复用现有解析逻辑）+ V2rayBase64Parser
- [ ] `subscription/normalizer.rs` — 地区推测、metadata 补全
- [ ] `subscription/deduplicator.rs` — 去重
- [ ] `ipc/subscription_commands.rs` — 订阅 CRUD IPC

### Phase 3: 内核适配层
- [ ] `adapter/mod.rs` — CoreAdapter trait
- [ ] `adapter/mihomo/` — MihomoAdapter 完整实现
  - config_gen: Endpoint[] → YAML
  - api_client: REST API 封装
  - adapter: CoreAdapter impl
- [ ] `system_proxy/` — 复用现有平台代码，模块化改造

### Phase 4: 核心编排
- [ ] `core/connection_manager.rs` — 连接状态机
- [ ] `core/node_selector.rs` — 节点筛选/收藏
- [ ] `core/traffic_monitor.rs` — 流量监控
- [ ] `ipc/` — 全部 IPC 命令迁移

### Phase 5: 集成与 lib.rs 重写
- [ ] `lib.rs` — 重写 Tauri Builder，用新模块替换旧 commands
- [ ] 移除旧 `commands/` 目录和 `config.rs`
- [ ] 前端 API 层适配

---

## 十一、依赖变更（Cargo.toml）

```toml
# 新增
sqlx = { version = "0.8", features = ["runtime-tokio", "sqlite"] }
async-trait = "0.1"
uuid = { version = "1", features = ["v4"] }
thiserror = "2"

# 保留
tauri, serde, serde_json, serde_yaml, reqwest, tokio, chrono, base64, log
tauri-plugin-shell, tauri-plugin-log, tauri-plugin-autostart, tauri-plugin-opener
tauri-plugin-store  # Phase 5 评估是否移除, DB 取代

# 可能移除（Phase 5）
tauri-plugin-mihomo  # 由自建 adapter 取代
```

---

## 十二、关键设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| ORM vs 原生 SQL | **sqlx 原生 SQL** | 编译时检查、轻量、SQLite 友好 |
| Endpoint 复杂字段存储 | `auth_json` / `transport_json` / `metadata_json` TEXT 列 | 避免过多列，serde_json 序列化，查询时按需反序列化 |
| 内核进程管理 | 保持 sidecar 模式 | 与 Tauri shell plugin 兼容，跨平台一致 |
| 状态共享 | `Arc<RwLock<...>>` + Tauri State | 异步安全，读多写少场景高效 |
| 错误处理 | `thiserror` → `AppError` enum | 统一错误链，IPC 层统一 `.map_err(to_string)` |

---

> **迁移策略**：新旧代码并存，Phase 1-4 不删除旧 `commands/`，Phase 5 一次性切换并移除旧代码。这样每个阶段都可以独立编译和测试。
