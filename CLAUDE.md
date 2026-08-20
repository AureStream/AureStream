# CLAUDE.md

Guidance for Claude Code and other agents in this repository.

**Canonical project rules**: see [`AGENTS.md`](./AGENTS.md).  
**Wiki**: [`docs/index.md`](./docs/index.md) — prefer code when wiki pages lag.  
**TUN implementation notes**: [`docs/superpowers/plans/2026-08-05-aurestream-v2-tun-three-platforms.md`](./docs/superpowers/plans/2026-08-05-aurestream-v2-tun-three-platforms.md) — design record from when TUN was built; Linux/Windows/macOS TUN now ships (see AGENTS.md's "Current product surface").

## Quick orientation

AureStream **v2**: **Tauri v2** + **React/TypeScript** + **Xray-core** sidecar (`aurestream-core`).

**Default capture**: system proxy. TUN is an optional mode backed by a platform-specific elevated helper (Linux systemd+polkit, Windows SCM service, macOS SMJobBless) — see AGENTS.md for install/packaging requirements per platform.

| Area | Location |
|---|---|
| Frontend | `src/` — `/login`, `/register`, shell `/` `/nodes` `/profile` |
| Tauri shell / IPC / tray / logs | `src-tauri/` |
| Auth + subscriptions HTTP | `crates/aurestream-api-client/` |
| Subscription decode | `crates/aurestream-config/` (`ProxyNode` only) |
| Engine + Xray dialect | `crates/aurestream-engine/` |
| System proxy | `crates/aurestream-platform-proxy/` |
| TUN elevated helpers | `crates/aurestream-platform-tun/` |
| Error modals | `src/contexts/AlertContext.tsx` |
| Node latency | `src/lib/node-speed-test.ts`, `src-tauri/src/commands/network.rs` |

## Common commands

```bash
pnpm dev                 # Vite (port 1420)
pnpm tauri dev           # Desktop app
pnpm build               # tsc + vite build
pnpm test                # vitest run
pnpm tauri build         # Full Tauri build
pnpm download-binaries   # Xray → src-tauri/binaries/aurestream-core-* + geo DBs
pnpm release             # binaries + build + tauri build (no TUN)

# Rust
cargo check --workspace
cargo test --workspace
```

## Architecture snapshot

1. Frontend → Rust: `invoke()` (auth / subs / engine / `ping_tcp`)
2. Rust → Frontend: events (`auth-changed`, `subs-updated`, `engine-state`, `app-alert`, …)
3. Engine builds Xray JSON via `build_config`, runs sidecar; shell sets/clears system proxy (or hands off to a TUN helper)
4. Tray can start/stop system proxy or TUN (once the platform helper is installed); quit

**Constraints**: default path (no extra install) is system proxy only; TUN needs its platform helper installed first (see AGENTS.md).

**UI copy**: Chinese-only (no i18n). Path alias: `@/*` → `./src/*`.

For detailed conventions and “where to look first”, use **AGENTS.md**.

