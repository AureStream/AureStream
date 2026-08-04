# AGENTS.md

Project instructions for coding agents working in AureStream.

## Project

AureStream is a cross-platform proxy/VPN client (Tauri v2 + React + Xray-core sidecar).

**Docs**: `docs/index.md` (architecture, config merger, UI system, build/deploy). Prefer code over docs when they disagree — some wiki pages lag the mobile-shell rewrite on `feat/mobile-ui`.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, TypeScript, Vite 7, Tailwind CSS v4, shadcn/ui (new-york), react-router-dom |
| Backend | Rust / Tauri v2, Tokio |
| Engine | Xray-core sidecar + gRPC API CLI |
| Package manager | pnpm (ESM) |
| Tests | Vitest (`pnpm test`) |

Path alias: `@/*` → `./src/*`.

## Commands

```bash
pnpm dev                 # Vite only (port 1420)
pnpm tauri dev           # Full desktop app
pnpm build               # tsc + vite build
pnpm test                # vitest run
pnpm tauri build         # Full Tauri release build
pnpm download-binaries   # Xray-core + geo rule DBs
pnpm build-tun           # Windows TUN service
pnpm pre-bundle          # macOS privileged helper
pnpm release             # binaries + tun + build + tauri build

# Rust (src-tauri/ or workspace root)
cargo check
cargo build
```

Prefix shell commands with `rtk` when available (see RTK section in `CLAUDE.md`).

## Architecture (current)

### Communication

1. **Frontend → Rust**: `invoke()` (`@tauri-apps/api/core`). Handlers in `src-tauri/src/lib.rs` → `core/`, `commands/`, `engine/`.
2. **Rust → Frontend**: events (`engine-state`, `tauri-log`, …).
3. **Frontend → Xray**: thin wrappers in `src/utils/xray-api/` + Tauri commands (`select_node`, traffic events).

### Engine

State machine: `Idle → Starting → Running → Stopping → Idle` (+ `Failed`) in `src-tauri/src/engine/state_machine.rs`.

Platform engines:
- Windows: sidecar + WinINet proxy + TUN service
- macOS: XPC helper, DNS watcher, watchdog
- Linux: pkexec helper, systemd-resolved

Privilege / TUN / system proxy live in workspace crates:
- `crates/aurestream-plugin-proxy`
- `crates/aurestream-plugin-tun`
- `crates/aurestream-plugin-privilege`

### Config pipeline

Orchestration in `src/lib/` + merger in `src/config/merger/`:

- `config-sync.ts` — debounced pre-merge on subscription/settings changes
- `merge-cache-key.ts` / `merge-cache.ts` — skip rewrite on cache hit unless `force`
- `connection-flow.ts` — `ensureConnectionConfigReady` then `start`
- `hot-reload-config.ts` — force merge + `reload_config` while running

### Persistence

- Settings: `settings.json` via `@tauri-apps/plugin-store` (`src/single/store.ts`)
- DB: SQLite `data.db` via `@tauri-apps/plugin-sql` (`src/single/db.ts`, `src/action/db.ts`)

### Frontend structure (mobile shell)

Routing is **react-router-dom**, not tab-only NavigationContext:

- Public: `/login`, `/register` (`AuthLayout`)
- Protected: `/dashboard/*` (`Dashboard`)
  - index → `MobileHome`
  - `nodes` → `NodesPage`
  - `profile` → `ProfilePage`
  - `about` → `AboutPage`

Key modules:

```
src/
  api/                 # auth + remote subscription HTTP clients
  action/              # local DB CRUD
  components/          # pages + shell (Mobile*, Auth*, Dashboard)
  config/merger/       # Xray config generation
  contexts/            # AuthContext, UpdateContext
  hooks/               # useEngineState, useTrafficAccumulator
  lib/                 # connection, config-sync, session bootstrap, …
  single/              # store + db singletons
  types/
  utils/xray-api/      # node select + traffic helpers
  utils/vpn-service.ts # engine start/stop IPC wrappers
```

State: React Context (no Redux/Zustand). Auth gate uses `useAuth()` (`user`, `loading`, `sessionReady`).

## Conventions

### TypeScript / React

- Functional components + hooks only.
- Prefer `@/` imports.
- Keep connection/config logic in `src/lib/`; UI components should call those helpers, not reimplement merge/connect.
- Colocate unit tests as `*.test.ts` next to the module; run with `pnpm test`.

### UI / styling

- Tailwind v4 + CSS variables in `src/index.css` (light/dark).
- Prefer semantic tokens (`text-muted-foreground`, `bg-card`, …) over hard-coded colors.
- shadcn/ui new-york style; add via `npx shadcn@latest add <name>` (`components.json`).
- UI copy is Chinese-only (no i18n). Prefer plain Chinese strings in components.
- No font size below 11px. Prefer design-system classes when present (`type-*`, `surface-*`, `btn-*` per `docs/ui-design-system.md`).

### Rust / Tauri

- New IPC: implement handler, register in `src-tauri/src/lib.rs` `generate_handler!`, expose a thin TS wrapper under `src/utils/` or `src/lib/`.
- Keep platform-specific privilege/TUN/proxy code in the workspace crates, not duplicated in the app crate.
- Engine lifecycle changes go through the state machine — do not bypass it.

### Safety / product constraints

- This app manages system proxy, TUN, DNS, and elevated helpers. Be careful with start/stop/reload ordering and cleanup on failure.
- Do not commit secrets, signing certs, or local `.env` values.
- Deep link scheme: `aurestream://`.

## Where to look first

| Task | Start here |
|---|---|
| Connect / disconnect UX | `src/lib/connection-flow.ts`, `src/hooks/useEngineState.ts`, `src/utils/vpn-service.ts` |
| Config merge bugs | `src/config/merger/`, `src/lib/config-sync.ts`, `src/lib/connection-config.ts` |
| Node list / latency | `src/components/NodesPage.tsx`, `src/lib/node-latency.ts`, `src/utils/xray-api/` |
| Auth / session | `src/contexts/AuthContext.tsx`, `src/lib/session-bootstrap.ts`, `src/api/auth.ts` |
| Mobile home UI | `src/components/MobileHome.tsx`, `src/components/MobileTopBar.tsx` |
| Engine state machine | `src-tauri/src/engine/state_machine.rs` |
| Tauri commands | `src-tauri/src/core/`, `src-tauri/src/commands/` |
| Platform privilege | `crates/aurestream-plugin-privilege/` |

## Build notes

- Base Tauri config: `src-tauri/tauri.conf.json`
- Windows overlay: `tauri.windows.conf.json` (TUN service sidecar)
- Linux overlay: `tauri.linux.conf.json`
- macOS privileged helper requires signing (`pnpm pre-bundle`, `pnpm sign-macos-bundle`)
- Scripts: `scripts/download-binaries.ts`, `scripts/build-tun-service.ts`, `scripts/prebundle.ts`
