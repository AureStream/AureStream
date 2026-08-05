# AGENTS.md

Project instructions for coding agents working in AureStream **v2**.

## Project

AureStream is a cross-platform proxy client (Tauri v2 + React + **Xray-core** sidecar).

**Source of truth**: code under `src/`, `src-tauri/`, `crates/`.  
**Wiki index**: [`docs/index.md`](./docs/index.md) — prefer code when wiki pages lag.  
**TUN roadmap** (not shipped yet): [`docs/superpowers/plans/2026-08-05-aurestream-v2-tun-three-platforms.md`](./docs/superpowers/plans/2026-08-05-aurestream-v2-tun-three-platforms.md)

### Hard rules

- **New features only in the v2 tree**: root `src/`, `src-tauri/`, and `crates/aurestream-*`.
- **`legacy/` is archived / read-only reference.** Do **not** fix bugs or add features there.
- **Default capture path = system proxy** — no TUN / privileged helper / `build-tun` in the default release path until the TUN plan is implemented and product-enabled.
- Engine config dialect lives in `aurestream-engine` (`build_config`); `aurestream-config` only decodes → `ProxyNode`.

### Current product surface (implemented)

- Auth (login / email-code register) + subscription sync
- Node list, TCP latency probe + sort, home shows selected-node latency
- Connect / disconnect via Xray sidecar + OS system proxy (Win / macOS / Linux)
- System tray (show window, system proxy toggle, TUN menu stub, quit)
- Unified app/core logs; errors via in-app modal (`app-alert` from Rust)

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, TypeScript, Vite 7, Tailwind CSS v4, react-router-dom |
| Shell | Tauri v2, Tokio, tray-icon |
| Engine | Xray-core sidecar (`aurestream-core`) via `aurestream-engine` |
| Platform | `aurestream-platform-proxy` (set/clear system proxy) |
| API | `aurestream-api-client` (Worker auth + subscriptions) |
| Package manager | pnpm (ESM) |
| Tests | Vitest (`pnpm test`), Cargo tests in crates |

Path alias: `@/*` → `./src/*`.

## Commands

```bash
pnpm dev                 # Vite only (port 1420)
pnpm tauri dev           # Full desktop app
pnpm build               # tsc + vite build
pnpm test                # vitest run
pnpm tauri build         # Full Tauri release build
pnpm download-binaries   # Xray-core → src-tauri/binaries/aurestream-core-* + geo DBs
pnpm release             # download-binaries + build + tauri build (no TUN)

# Rust (workspace root)
cargo check --workspace
cargo test --workspace
```

Prefix shell commands with `rtk` when available (see RTK section in `CLAUDE.md` / `Claude.md`).

## Layout

```text
AureStream/
  src/                            # React UI (auth, home, nodes, profile)
  src-tauri/                      # Thin Tauri shell + IPC + tray + logging
  crates/
    aurestream-api-client/        # HTTP auth + subscriptions
    aurestream-config/            # Decode subscription → ProxyNode only
    aurestream-engine/            # Engine trait + XrayEngine + state machine
    aurestream-platform-proxy/    # OS system proxy set/clear
  legacy/                         # Pre-v2 monolith (unmaintained)
  scripts/download-binaries.ts    # Fetch Xray as aurestream-core
  docs/
    index.md                      # Wiki index
    superpowers/plans/            # Active plans (e.g. TUN three-platform)
```

## Architecture (v2)

### Communication

1. **Frontend → Rust**: `invoke()` handlers in `src-tauri` (auth / subs / engine / `ping_tcp`).
2. **Rust → Frontend**: events (`auth-changed`, `subs-updated`, `engine-state`, `app-alert`, …).
3. **Engine**: `Idle → Starting → Running → Stopping → Idle` (+ `Failed`) in `crates/aurestream-engine`.

### Runtime flow

UI → auth/subs IPC → `aurestream-api-client` → events  
UI / tray → `engine_start` / `engine_stop` / `engine_select_node` → `aurestream-engine`  
On Running / Idle|Failed, shell orchestrates `aurestream-platform-proxy`.

### Frontend

- Public: `/login`, `/register`
- Protected shell: `/`, `/nodes`, `/profile` (event-driven; no fullscreen sync gate)
- Global error UI: `AlertProvider` (`src/contexts/AlertContext.tsx`)

UI copy: Chinese-only (no i18n).

## Conventions

### TypeScript / React

- Functional components + hooks only.
- Prefer `@/` imports.
- Keep business logic out of presentational components when a lib/context already owns it.
- Colocate unit tests as `*.test.ts` next to the module.

### Rust / Tauri

- New IPC: implement handler, register in `src-tauri`, expose a thin TS wrapper, add capability permission if needed.
- Engine lifecycle goes through the state machine — do not bypass it.
- Do not emit Xray JSON from the frontend or from `aurestream-config`.
- User-facing failures: prefer `app-alert` / frontend modal over silent log-only.

### Safety / product constraints

- Start/stop must clear system proxy on failure/stop.
- Do not commit secrets, signing certs, or local `.env` values.
- Do not land TUN / privileged helpers in the default release path without following the TUN plan and an explicit product decision.

## Where to look first

| Task | Start here |
|---|---|
| Connect / disconnect | `src/components/HomePage.tsx`, engine IPC in `src-tauri`, `crates/aurestream-engine` |
| System tray | `src-tauri/src/tray.rs`, `window_util.rs` |
| Logging | `src-tauri/src/logging.rs` |
| Error dialogs | `src/contexts/AlertContext.tsx` |
| Node latency / speed test | `src/components/NodesPage.tsx`, `src/lib/node-speed-test.ts`, `src-tauri/src/commands/network.rs` |
| Subscription decode | `crates/aurestream-config` |
| Auth / session | `src/contexts/AuthContext.tsx`, `crates/aurestream-api-client` |
| System proxy | `crates/aurestream-platform-proxy` |
| Sidecar binary | `scripts/download-binaries.ts`, `src-tauri/binaries/` |
| TUN (planned) | `docs/superpowers/plans/2026-08-05-aurestream-v2-tun-three-platforms.md`, `legacy/` reference only |
| Pre-v2 reference only | `legacy/` (do not maintain) |

## Build notes

- Base Tauri config: `src-tauri/tauri.conf.json` (`externalBin`: `binaries/aurestream-core`)
- CI: `.github/workflows/build-desktop.yml` builds the **new** tree (no `build-tun` / no macOS helper pre-bundle by default)
- Logs (all platforms): app `aurestream-app.log`, core `aurestream-core-YYYY-MM-DD.log` under the OS app log dir
