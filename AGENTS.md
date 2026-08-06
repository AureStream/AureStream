# AGENTS.md

Project instructions for coding agents working in AureStream **v2**.

## Project

AureStream is a cross-platform proxy client (Tauri v2 + React + **Xray-core** sidecar).

**Source of truth**: code under `src/`, `src-tauri/`, `crates/`.  
**Wiki index**: [`docs/index.md`](./docs/index.md) — prefer code when wiki pages lag.  
**TUN roadmap**: [`docs/superpowers/plans/2026-08-05-aurestream-v2-tun-three-platforms.md`](./docs/superpowers/plans/2026-08-05-aurestream-v2-tun-three-platforms.md)

### Hard rules

- **New features only in the v2 tree**: root `src/`, `src-tauri/`, and `crates/aurestream-*`.
- **`legacy/` is archived / read-only reference.** Do **not** fix bugs or add features there.
- **Default capture path = system proxy**. TUN is optional (`mode: "tun"`, Home 虚拟网卡). **Linux** (`pkexec` + polkit) and **Windows** (SCM `AureStreamTunService` / `tun-service.exe`, one-time UAC) elevated paths are implemented; macOS still Phase 2. Without a helper/service, TUN start returns a clear install error. AppImage does not install `/usr` helpers — use deb/rpm or `scripts/install-linux-tun-helper.sh` for dev. Windows: `pnpm build-tun` stages `tun-service-*.exe`; need `wintun.dll` next to core.
- Engine config dialect lives in `aurestream-engine` (`build_config`); `aurestream-config` only decodes → `ProxyNode`.

### Current product surface (implemented)

- Auth (login / email-code register) + subscription sync
- Node list, TCP latency probe + sort, home shows selected-node latency
- Connect / disconnect via Xray sidecar + OS system proxy (Win / macOS / Linux)
- **Linux TUN**: `aurestream-platform-tun` + `/usr/lib/AureStream/aurestream-tun-helper` (deb/rpm / dev install script)
- **Windows TUN**: SCM service via `tun-service.exe` (UAC install once; NameServer hijack to `1.1.1.1` after core ready)
- System tray (show window, system proxy / TUN toggle when helper ready, quit)
- Unified app/core logs; errors via in-app modal (`app-alert` from Rust)

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, TypeScript, Vite 7, Tailwind CSS v4, react-router-dom |
| Shell | Tauri v2, Tokio, tray-icon |
| Engine | Xray-core sidecar (`aurestream-core`) via `aurestream-engine` |
| Platform | `aurestream-platform-proxy` (system proxy); `aurestream-platform-tun` (TUN helpers) |
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
pnpm release             # download-binaries + build + tauri build
./scripts/install-linux-tun-helper.sh   # Linux dev: install pkexec helper + polkit
pnpm build-tun           # Windows: build tun-service.exe into src-tauri/binaries/

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
    aurestream-platform-tun/      # TUN: Linux helper + Windows tun-service (mac later)
  legacy/                         # Pre-v2 monolith (unmaintained)
  scripts/download-binaries.ts    # Fetch Xray as aurestream-core
  scripts/install-linux-tun-helper.sh
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
Capture: `SystemProxy` → `platform-proxy`; `Tun` → elevated helper owns core (`begin_external_start` / `finish_external_*`, no user-space double-spawn).

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

- Start/stop must clear system proxy on failure/stop; TUN stop must restore DNS (best-effort).
- Do not commit secrets, signing certs, or local `.env` values.
- Linux TUN packaging: deb/rpm map helper + polkit under `src-tauri/tauri.conf.json` `bundle.linux`; AppImage is not a supported TUN install path.

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
