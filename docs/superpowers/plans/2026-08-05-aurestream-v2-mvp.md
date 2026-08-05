# AureStream v2 MVP 实现计划

> **面向代理执行者：** 必须使用子技能 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`，按任务逐步实现。步骤使用复选框（`- [ ]`）跟踪进度。

**目标：** 用边界清晰的 AureStream v2 MVP 替换已不再维护的旧应用：Worker 鉴权 + 订阅、Engine trait 背后的 Xray、仅系统代理、事件驱动首页、在根目录 `src/` + `src-tauri/` 上的全新 UI。

**架构：** 薄 Tauri 壳只暴露少量 IPC；`aurestream-api-client` 负责 HTTP；`aurestream-config` **只解码**订阅为引擎无关的 `ProxyNode`；`aurestream-engine`（MVP：`XrayEngine`）负责 **`build_config` 写出内核方言 JSON** + 状态机 + sidecar；`aurestream-platform-proxy` 只设置/清除系统代理。UI 订阅事件（`auth-changed`、`subs-updated`、`engine-state`），绝不被串行 bootstrap 门闸挡住。

**技术栈：** Tauri v2、React 19、TypeScript、Vite、Tailwind v4、shadcn/ui、Rust/Tokio、Xray-core sidecar、Vitest、`cargo test`、pnpm 仓库根。

**规格：** [docs/superpowers/specs/2026-08-05-aurestream-v2-boundaries-design.md](../specs/2026-08-05-aurestream-v2-boundaries-design.md)

## 全局约束

- 旧应用**不再维护**；移入 `legacy/`（或打 tag 后删除），仅作参考。
- 布局保持根目录 `src/` + `src-tauri/`（不用 `apps/desktop`）。
- MVP：**不做 TUN**，仅系统代理。
- Engine **trait** + MVP 只实现 **Xray**。
- 后端：沿用 Worker API，默认基址 `https://aurestream-api.chilix.ccwu.cc/api`（可用环境变量覆盖）。
- UI 文案：仅中文。
- 默认不做多节点 random 负载均衡；只有一个选中出口。
- 禁止用 `sessionReady` / 预合并门闸阻塞首页首屏。
- 状态以事件为准；命令只触发动作。
- 纯逻辑坚持 TDD（订阅解码、引擎 `build_config`、状态机、鉴权错误映射）。
- `aurestream-config` **禁止**依赖或生成 Xray/sing-box JSON；方言只在引擎实现内。
- 不提交密钥；MVP 不复活旧版 TUN DNS 覆盖逻辑。

## 目标文件映射

| 路径 | 职责 |
|---|---|
| `legacy/**` | 冻结的旧 `src`、`src-tauri`、旧 plugin crates |
| `crates/aurestream-api-client/` | reqwest 鉴权 + 订阅；类型化错误 |
| `crates/aurestream-config/` | URI 解码 → `ProxyNode`（引擎无关，不写 config.json） |
| `crates/aurestream-engine/` | `Engine` trait（含 `build_config`）、`XrayEngine`、状态机、sidecar |
| `crates/aurestream-platform-proxy/` | `set_system_proxy(host,port)` / `clear_system_proxy()` |
| `src-tauri/` | 窗口、注册 IPC、发 Tauri 事件、持有 `AppState` |
| `src/` | React 路由、Auth/Engine/Subs Context、新 UI |
| `scripts/download-binaries.ts` | 保留/改为只拉 Xray（MVP 脚本不含 TUN 构建） |
| 根目录 `Cargo.toml` / `package.json` | workspace 成员与脚本只指向新应用 |

---

### 任务 1：打标签并隔离旧代码树

**文件：**
- 创建：`legacy/README.md`
- 移动：`src/` → `legacy/src/`，`src-tauri/` → `legacy/src-tauri/`
- 移动（建议）：`crates/aurestream-plugin-*` → `legacy/crates/`
- 修改：根 `Cargo.toml`（暂时清空 members 或只留占位）
- 修改：如需保证 `legacy/` 被跟踪，调整 `.gitignore`

**接口：**
- 产出：移动前打 git tag `pre-v2-legacy`；根目录腾空以便脚手架

- [ ] **步骤 1：创建带注解的回滚标签**

```bash
git tag -a pre-v2-legacy -m "Last tree before AureStream v2 rewrite"
```

- [ ] **步骤 2：添加 legacy 说明**

```markdown
# legacy

未维护的 pre-v2 AureStream（Xray 迁移时期）。不要在此修功能。
实现 v2 时仅作参考；新代码在仓库根目录 `src/` 与 `src-tauri/`。
```

- [ ] **步骤 3：用 git mv 移动目录树**

```bash
mkdir -p legacy/crates
git mv src legacy/src
git mv src-tauri legacy/src-tauri
git mv crates/aurestream-plugin-proxy legacy/crates/
git mv crates/aurestream-plugin-tun legacy/crates/
git mv crates/aurestream-plugin-privilege legacy/crates/
```

- [ ] **步骤 4：清空根 Cargo workspace**

```toml
[workspace]
members = []
resolver = "2"
```

（下一任务再加入新成员。）

- [ ] **步骤 5：提交**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: quarantine pre-v2 tree under legacy/

Tag pre-v2-legacy marks the last maintained monolith before the v2 rewrite.
EOF
)"
```

---

### 任务 2：搭建新的 Tauri + React 壳（事件总线占位）

**文件：**
- 创建：`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`、`src-tauri/src/lib.rs`、`src-tauri/src/main.rs`
- 创建：`src/main.tsx`、`src/App.tsx`、`src/index.css`、`index.html`、`vite.config.ts`、`tsconfig.json`
- 修改：根 `package.json` 脚本；根 `Cargo.toml` members = `["src-tauri"]`
- 保留/改造：若有用则沿用 `components.json`（shadcn），否则重建最小配置

**接口：**
- 产出：`pnpm tauri dev` 可打开中文占位窗口；尚无业务事件
- 依赖：无

- [ ] **步骤 1：在仓库根生成最小 Tauri v2 + Vite React 应用**

包名/产品名沿用 `legacy/src-tauri/tauri.conf.json` 中的 `com.root.aurestream` / `AureStream`，保持安装路径与更新路径习惯一致。

- [ ] **步骤 2：在 `App.tsx` 接上 react-router 骨架（暂无鉴权门闸）**

```tsx
import { BrowserRouter, Routes, Route } from "react-router-dom"

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<div className="p-8 text-lg font-bold">AureStream</div>} />
        <Route path="/login" element={<div>登录</div>} />
      </Routes>
    </BrowserRouter>
  )
}
```

- [ ] **步骤 3：验证开发壳**

运行：`pnpm install && pnpm tauri dev`  
预期：窗口打开，首页显示「AureStream」

- [ ] **步骤 4：提交**

```bash
git commit -m "chore: scaffold v2 Tauri React shell at repo root"
```

---

### 任务 3：`aurestream-api-client`（鉴权 + 订阅）

**文件：**
- 创建：`crates/aurestream-api-client/Cargo.toml`
- 创建：`crates/aurestream-api-client/src/lib.rs`
- 创建：`crates/aurestream-api-client/src/auth.rs`
- 创建：`crates/aurestream-api-client/src/subscriptions.rs`
- 创建：`crates/aurestream-api-client/src/error.rs`
- 修改：根 `Cargo.toml` members

**接口：**
- 产出：
  - `pub struct ApiClient { base: String, ... }`
  - `ApiClient::login(email, password) -> Result<AuthTokens, ApiError>`
  - `ApiClient::register(email, password) -> Result<RegisterPending, ApiError>`
  - `ApiClient::verify_register(email, code) -> Result<User, ApiError>`
  - `ApiClient::list_subscriptions(access_token) -> Result<Vec<Subscription>, ApiError>`
  - `ApiError { code: String, status: u16, retry_after: Option<u32> }`
- 依赖：Worker OpenAPI，路径前缀 `/api`

- [ ] **步骤 1：先写失败的错误映射单元测试**

```rust
#[test]
fn maps_email_already_registered() {
    let err = ApiError::from_code("email_already_registered", 409, None);
    assert_eq!(err.code, "email_already_registered");
}
```

- [ ] **步骤 2：跑测试（应失败）**

运行：`cargo test -p aurestream-api-client maps_email_already_registered`  
预期：FAIL（crate/类型尚不存在）

- [ ] **步骤 3：实现 client + 错误类型（reqwest + serde）**

默认基址：`https://aurestream-api.chilix.ccwu.cc/api`。  
注册 = POST `/auth/register`（202 pending）；验证 = POST `/auth/register/verify`。

- [ ] **步骤 4：测试通过**

运行：`cargo test -p aurestream-api-client`  
预期：PASS

- [ ] **步骤 5：提交**

```bash
git commit -m "feat(api-client): add Worker auth and subscriptions client"
```

---

### 任务 4：鉴权 IPC + 事件驱动 AuthContext（无首页门闸）

**文件：**
- 创建：`src-tauri/src/commands/auth.rs`
- 创建：`src-tauri/src/state.rs`（token 存应用数据目录）
- 创建：`src/lib/ipc.ts`
- 创建：`src/contexts/AuthContext.tsx`
- 创建：`src/components/LoginPage.tsx`
- 创建：`src/components/RegisterPage.tsx`（同页两步验证）
- 修改：`src/App.tsx` 路由；`src-tauri/src/lib.rs` 注册命令并发事件

**接口：**
- 产出 IPC：`auth_login`、`auth_register`、`auth_verify`、`auth_logout`、`auth_restore`
- 产出事件：`auth-changed`，载荷 `{ user: User | null }`
- 依赖：`aurestream-api-client`

- [ ] **步骤 1：实现 Rust 命令，在登录/登出/恢复后 emit `auth-changed`**

恢复会话**不得**阻塞 webview 加载：异步 spawn，完成后再 emit。

- [ ] **步骤 2：AuthContext 监听 `auth-changed`；对外提供 login/register/verify/logout**

```ts
// 不要用会挡住子树的 sessionReady。
// 只用 user + authLoading（按钮转圈）。
```

- [ ] **步骤 3：注册页：账号密码 → 验证码 → verify → login**

行为对齐 Worker 流程（可参考 `legacy/src/api/auth.ts`）。

- [ ] **步骤 4：手工验收**

跑应用：打开 `/login`，失败登录显示中文错误映射；注册两步对生产 API（或 mock）可用。

- [ ] **步骤 5：提交**

```bash
git commit -m "feat(auth): IPC auth with auth-changed events and new auth pages"
```

---

### 任务 5：订阅同步 + `subs-updated` 事件

**文件：**
- 创建：`src-tauri/src/commands/subs.rs`
- 创建：`src/contexts/SubsContext.tsx`
- 按需：在 `aurestream-api-client` 增加拉取订阅正文的辅助（或稍后在 config 中拉取）
- 本地持久化：tauri-plugin-sql **或** MVP 用应用数据目录下单个 `subs.json`（推荐 JSON，减少表面积）

**接口：**
- 产出 IPC：`subs_sync`、`subs_list`
- 产出事件：`subs-updated`，载荷 `{ subscriptions: SubSummary[], activeId: string | null, nodes: NodeInfo[] }`
- NodeInfo：`{ tag: string, name: string, protocol: string }`

- [ ] **步骤 1：`subs_sync` 拉 Worker 列表、下载各订阅 URL 正文、本地存储、emit `subs-updated`**

- [ ] **步骤 2：SubsContext：mount 不阻塞；若有 `user` 则后台 `subs_sync`；监听事件**

- [ ] **步骤 3：确保登录成功后后台同步，不延迟跳转到 `/`**

- [ ] **步骤 4：提交**

```bash
git commit -m "feat(subs): sync subscriptions and emit subs-updated"
```

---

### 任务 6：`aurestream-config` — 仅解码订阅为 `ProxyNode`

**文件：**
- 创建：`crates/aurestream-config/Cargo.toml`
- 创建：`crates/aurestream-config/src/lib.rs`
- 创建：`crates/aurestream-config/src/decode.rs`
- 创建：`crates/aurestream-config/src/node.rs`（`ProxyNode` 定义）
- 创建：`crates/aurestream-config/tests/decode.rs`
- 仅参考：`legacy/src/config/subscription-decoder.ts`（URI 模式）
- **禁止创建** `xray.rs` / 任何写出内核 JSON 的模块

**接口：**
- 产出：
  - `pub struct ProxyNode { /* 引擎无关字段：tag, name, protocol, server, port, tls/ws/... */ }`
  - `pub fn decode_subscription_body(body: &str) -> Result<Vec<ProxyNode>, ConfigError>`
- 不产出：`write_*_config`、Xray/sing-box `Value` 整树上的 outbound
- `ProxyNode` **不得**携带 `"outboundTag"` / Xray `streamSettings` 等方言字段名；映射留给引擎

- [ ] **步骤 1：失败测试 — 解码 VLESS 行得到 tag / server / protocol**

```rust
#[test]
fn decodes_vless_ws_sample() {
    let body = "vless://095909af-8903-4305-8a7d-07fd0fb8c0e3@162.159.38.162:443?security=tls&type=ws&host=example.com&path=%2F#node1";
    let nodes = decode_subscription_body(body).unwrap();
    assert_eq!(nodes.len(), 1);
    assert_eq!(nodes[0].tag, "node1");
    assert_eq!(nodes[0].server, "162.159.38.162");
    assert_eq!(nodes[0].protocol, "vless");
}
```

- [ ] **步骤 2：实现解码器与 `ProxyNode`；测试通过**

- [ ] **步骤 3：约束检查 — crate 内无 `tun` / `inbounds` / `outbounds` JSON 拼装代码**

- [ ] **步骤 4：提交**

```bash
git commit -m "feat(config): decode subscriptions into engine-agnostic ProxyNode"
```

---

### 任务 7：`aurestream-platform-proxy`（仅系统代理）

**文件：**
- 创建：`crates/aurestream-platform-proxy/`
- 参考：`legacy/crates/aurestream-plugin-proxy` 的 WinINet / macOS / Linux 模式——**最小拷贝**，不要带上 TUN

**接口：**
- 产出：`set_system_proxy(host: &str, port: u16) -> Result<(), ProxyError>`
- 产出：`clear_system_proxy() -> Result<(), ProxyError>`

- [ ] **步骤 1：先实现 Windows（主测机 `10.20.41.26`）；macOS/Linux 可 stub 或同步实现 set/clear**

- [ ] **步骤 2：手工：set → 检查 IE/WinINET 代理 → clear**

- [ ] **步骤 3：提交**

```bash
git commit -m "feat(platform-proxy): system proxy set and clear for MVP"
```

---

### 任务 8：`aurestream-engine` — trait + `build_config` + Xray + 状态机

**文件：**
- 创建：`crates/aurestream-engine/src/lib.rs`
- 创建：`crates/aurestream-engine/src/state.rs`
- 创建：`crates/aurestream-engine/src/xray/mod.rs`（运行 sidecar）
- 创建：`crates/aurestream-engine/src/xray/config.rs`（**Xray 方言** `build_config`）
- 创建：`crates/aurestream-engine/tests/state_machine.rs`
- 创建：`crates/aurestream-engine/tests/xray_config.rs`
- 依赖：`aurestream-config`（仅 `ProxyNode`）
- Sidecar：复用 `scripts/download-binaries.ts`，将 `aurestream-core` / xray 放到应用资源旁

**接口：**
- 产出：
  - `pub enum EngineState { Idle, Starting, Running, Stopping, Failed { reason: String } }`
  - `pub trait Engine: Send {`
    - `fn build_config(&self, path: &Path, node: &ProxyNode, socks_port: u16, api_port: u16) -> Result<(), EngineError>;`
    - `async fn start(&self, config: &Path) -> Result<(), EngineError>;`
    - `async fn stop(&self) -> Result<(), EngineError>;`
    - `fn state(&self) -> EngineState;`
    - `}`
  - `XrayEngine::build_config`：socks/mixed `127.0.0.1:socks_port`，单出口 + direct/block，**无 tun**
  - `XrayEngine::start`：`-c config`；就绪 = TCP 连通 API/socks
- 启动成功后由调用方开系统代理；停止时调用方先清代理（Tauri 命令层编排）
- 未来 `SingboxEngine` 实现同一 trait，另写 sing-box JSON，不改 `aurestream-config`

- [ ] **步骤 1：合法状态转移的失败测试**

```rust
#[test]
fn starting_to_running_ok() {
    let mut sm = StateMachine::new();
    sm.force(EngineState::Starting);
    assert!(sm.transition(EngineState::Running).is_ok());
}
```

- [ ] **步骤 2：失败测试 — `build_config` 写出 JSON 无 tun、仅一个代理出口**

```rust
#[test]
fn xray_build_config_single_outbound_no_tun() {
    // ProxyNode 样例 → 临时文件 → 解析 JSON
    // assert: 无 protocol==tun；proxy outbounds 数量 == 1（不含 direct/block）
}
```

- [ ] **步骤 3：实现状态机 + XrayEngine（含 `build_config`）**

- [ ] **步骤 4：集成冒烟：decode → build_config → start → curl socks5 google generate_204**

- [ ] **步骤 5：提交**

```bash
git commit -m "feat(engine): Engine trait with build_config, state machine, Xray sidecar"
```

---

### 任务 9：Engine IPC 编排 + `engine-state` 事件

**文件：**
- 创建：`src-tauri/src/commands/engine.rs`
- 创建：`src/contexts/EngineContext.tsx`
- 修改：`src-tauri/src/lib.rs`

**接口：**
- IPC：`engine_start { nodeTag }`、`engine_stop`、`engine_select_node { nodeTag }`、`engine_get_state`
- 事件：`engine-state`，载荷 `{ state: string, reason?: string, selectedNode?: string }`
- 启动顺序：取 `ProxyNode` → `engine.build_config` → `engine.start` → `set_system_proxy` → emit Running；失败则清代理 + emit Failed
- 停止顺序：`clear_system_proxy` → `engine.stop` → emit Idle
- 命令层**不得**直接拼 Xray JSON（只调 Engine）

- [ ] **步骤 1：按规格 §4.2–4.3 严格顺序实现命令**

- [ ] **步骤 2：EngineContext 只监听 `engine-state`；前端不再复制一套状态机**

- [ ] **步骤 3：提交**

```bash
git commit -m "feat(engine): IPC start/stop/select with engine-state events"
```

---

### 任务 10：新首页 / 节点 / 我的 UI（事件优先）

**文件：**
- 创建：`src/components/HomePage.tsx`
- 创建：`src/components/NodesPage.tsx`
- 创建：`src/components/ProfilePage.tsx`
- 创建：`src/components/AppShell.tsx`（导航）
- 修改：`src/App.tsx`、`src/index.css`（新设计 token）
- 按需：`npx shadcn@latest add button ...`

**接口：**
- 依赖：仅 Auth、Subs、Engine Context
- 首页：连接按钮绑定 `engine_start`/`engine_stop`；显示当前节点；若 `nodes.length===0` 内联显示「订阅同步中」，**页面仍渲染**
- 节点页：来自 Subs 的列表；点击 → `engine_select_node`（并持久化选择）
- 我的：邮箱、退出

- [ ] **步骤 1：实现壳 + 三页，全新视觉方向（不要复刻旧版紫渐变盾牌）**

- [ ] **步骤 2：验证冷启动：`subs_sync` 完成前首页已可见；收到 `subs-updated` 后再填列表**

定性标准：没有为等同步而出现的全屏转圈。

- [ ] **步骤 3：提交**

```bash
git commit -m "feat(ui): event-driven home, nodes, and profile with new IA"
```

---

### 任务 11：二进制、脚本、CI、文档指向

**文件：**
- 修改：`scripts/download-binaries.ts`（只拉 Xray；跳过 TUN）
- 修改：`package.json` — MVP 默认 `release` 去掉 `build-tun`
- 修改：若路径失效则改 `.github/workflows/build-desktop.yml`
- 修改：`AGENTS.md` / `CLAUDE.md` — 指向 v2 布局与规格；标明 legacy 不维护
- 修改：根 README 描述（sing-box → Xray / v2）

- [ ] **步骤 1：`pnpm download-binaries` 对新应用资源路径可用**

- [ ] **步骤 2：`pnpm build` + `cargo check` 通过**

- [ ] **步骤 3：更新 agent 文档，禁止为做功能而改 `legacy/`**

- [ ] **步骤 4：提交**

```bash
git commit -m "chore: point build scripts and docs at AureStream v2 MVP"
```

---

### 任务 12：Windows 测试机端到端验收

**文件：**无（手工）

- [ ] **步骤 1：在 `10.20.41.26` 安装/运行 v2 构建**

- [ ] **步骤 2：验收清单**

  - 登录 / 注册+验证码可用  
  - 首页出现，无长时间白屏门闸  
  - `subs-updated` 后节点列表出现  
  - 连接后系统代理生效；百度 + Google 可用  
  - 停止后系统代理清除  
  - 未创建 TUN 适配器  

- [ ] **步骤 3：在 `docs/superpowers/plans/` 或 PR 描述中简短记录结果**

- [ ] **步骤 4：若有修复，单独提交（不要混进无关改动）**

---

## 规格覆盖检查

| 规格章节 | 对应任务 |
|---|---|
| §2 布局 / legacy / 配置拆分 | 1–2、6、8 |
| §3 crate 边界（decode vs build_config） | 3、6–8 |
| §4 启停 / IPC / ProxyNode 流 | 9 |
| §5 事件驱动启动 | 4–5、10 |
| §6 UI 信息架构 | 4、10 |
| §7 单出口 / 无 TUN / 方言在引擎 | 8–9 |
| §8 验收 | 12 |
| §9 迁移 | 1、11 |
| TUN / SingboxEngine 后续 | 明确不在本计划内 |

## 占位符扫描

无 TBD 步骤；TUN 与 sing-box 引擎按设计推迟到后续规格/计划。
