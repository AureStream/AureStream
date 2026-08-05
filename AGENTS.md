# AGENTS.md

Project instructions for coding agents working in AureStream **v2 MVP**.

## Project

AureStream is a cross-platform proxy client (Tauri v2 + React + **Xray-core** sidecar).

**Canonical design**: [`docs/superpowers/specs/2026-08-05-aurestream-v2-boundaries-design.md`](./docs/superpowers/specs/2026-08-05-aurestream-v2-boundaries-design.md)  
**Implementation plan**: [`docs/superpowers/plans/2026-08-05-aurestream-v2-mvp.md`](./docs/superpowers/plans/2026-08-05-aurestream-v2-mvp.md)  
**Wiki index**: [`docs/index.md`](./docs/index.md) — prefer code + the v2 spec when older wiki pages lag.

### Hard rules

- **New features only in the v2 tree**: root `src/`, `src-tauri/`, and `crates/aurestream-*`.
- **`legacy/` is archived / read-only reference.** Do **not** fix bugs or add features there.
- **MVP = system proxy only** — no TUN, no privileged helper, no `build-tun` in the default release path.
- Engine config dialect lives in `aurestream-engine` (`build_config`); `aurestream-config` only decodes → `ProxyNode`.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, TypeScript, Vite 7, Tailwind CSS v4, react-router-dom |
| Shell | Tauri v2, Tokio |
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

Prefix shell commands with `rtk` when available (see RTK section in `CLAUDE.md`).

## Layout

```text
AureStream/
  src/                            # React UI (auth, home, nodes, profile)
  src-tauri/                      # Thin Tauri shell + IPC + AppState
  crates/
    aurestream-api-client/        # HTTP auth + subscriptions
    aurestream-config/            # Decode subscription → ProxyNode only
    aurestream-engine/            # Engine trait + XrayEngine + state machine
    aurestream-platform-proxy/    # OS system proxy set/clear
  legacy/                         # Pre-v2 monolith (unmaintained)
  scripts/download-binaries.ts    # Fetch Xray as aurestream-core
  docs/superpowers/specs|plans/   # v2 design + plan
```

## Architecture (v2)

### Communication

1. **Frontend → Rust**: `invoke()` handlers in `src-tauri` (auth / subs / engine).
2. **Rust → Frontend**: events (`auth-changed`, `subs-updated`, `engine-state`, …).
3. **Engine**: `Idle → Starting → Running → Stopping → Idle` (+ `Failed`) in `crates/aurestream-engine`.

### Runtime flow

UI → auth/subs IPC → `aurestream-api-client` → events  
UI → `engine_start` / `engine_stop` / `engine_select_node` → `aurestream-engine`  
On Running / Idle|Failed, shell orchestrates `aurestream-platform-proxy`.

### Frontend (MVP)

- Public: `/login`, `/register`
- Protected shell: `/`, `/nodes`, `/profile` (event-driven; no fullscreen sync gate)

UI copy: Chinese-only (no i18n).

## Conventions

### TypeScript / React

- Functional components + hooks only.
- Prefer `@/` imports.
- Keep business logic out of presentational components when a lib/context already owns it.
- Colocate unit tests as `*.test.ts` next to the module.

### Rust / Tauri

- New IPC: implement handler, register in `src-tauri`, expose a thin TS wrapper.
- Engine lifecycle goes through the state machine — do not bypass it.
- Do not emit Xray JSON from the frontend or from `aurestream-config`.

### Safety / product constraints

- Start/stop must clear system proxy on failure/stop.
- Do not commit secrets, signing certs, or local `.env` values.
- Do not reintroduce TUN into the default MVP path without an explicit product decision.

## Where to look first

| Task | Start here |
|---|---|
| Connect / disconnect | `src/components/HomePage.tsx`, engine IPC in `src-tauri`, `crates/aurestream-engine` |
| Subscription decode | `crates/aurestream-config` |
| Auth / session | `src/contexts/AuthContext.tsx`, `crates/aurestream-api-client` |
| System proxy | `crates/aurestream-platform-proxy` |
| Sidecar binary | `scripts/download-binaries.ts`, `src-tauri/binaries/` |
| Pre-v2 reference only | `legacy/` (do not maintain) |

## Build notes

- Base Tauri config: `src-tauri/tauri.conf.json` (`externalBin`: `binaries/aurestream-core`)
- CI: `.github/workflows/build-desktop.yml` builds the **new** tree (no `build-tun` / no macOS helper pre-bundle)
- Spec tag before rewrite: `pre-v2-legacy`
