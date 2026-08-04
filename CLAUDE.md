# CLAUDE.md

Guidance for Claude Code and other agents in this repository.

**Canonical project rules**: see [`AGENTS.md`](./AGENTS.md) (kept current for the mobile-shell / auth rewrite).  
**Full wiki**: [`docs/index.md`](./docs/index.md) — prefer code when docs lag.

## Quick orientation

AureStream is a cross-platform proxy/VPN client: **Tauri v2** (Rust) + **React/TypeScript** frontend + **Xray-core** sidecar.

| Area | Location |
|---|---|
| Frontend | `src/` — React Router app (`/login`, `/register`, `/dashboard/*`) |
| Config merge | `src/config/merger/`, `src/lib/config-sync.ts`, `connection-flow.ts` |
| Xray helpers | `src/utils/xray-api/` |
| Rust engine | `src-tauri/src/engine/` |
| Tauri commands | `src-tauri/src/core/`, `src-tauri/src/commands/` |
| Privilege / TUN / proxy | `crates/aurestream-plugin-*` |

## Common commands

```bash
pnpm dev                 # Vite (port 1420)
pnpm tauri dev           # Desktop app
pnpm build               # tsc + vite build
pnpm test                # vitest run
pnpm tauri build         # Full Tauri build
pnpm download-binaries   # Xray-core + geo rule DBs
pnpm build-tun           # Windows TUN service
pnpm pre-bundle          # macOS privileged helper
pnpm release             # binaries + tun + build + tauri build

# Rust
cargo check              # from repo root or src-tauri/
cargo build
```

## Architecture snapshot

**Three-tier I/O**

1. Frontend → Rust: `invoke()` (handlers registered in `src-tauri/src/lib.rs`)
2. Rust → Frontend: events (`engine-state`, `tauri-log`, …)
3. Frontend → Xray: `src/utils/xray-api/` + Tauri commands (`select_node`, traffic events)

**Engine**: `Idle → Starting → Running → Stopping → Idle` (+ `Failed`) in `state_machine.rs`.

**Config**: debounced pre-merge (`config-sync`) → cache key skip → connect (`connection-flow`) / hot reload (`reload_config`).

**UI (current branch)**: auth-gated react-router app; dashboard routes to `MobileHome`, `NodesPage`, `ProfilePage`, `AboutPage`. Contexts: `AuthContext`, `UpdateContext`.

**Persistence**: `settings.json` (plugin-store), `data.db` (plugin-sql).

**i18n**: `lang/zh.json` (default), `lang/en.json` via `react-i18next`.

**Path alias**: `@/*` → `./src/*`.

**UI**: shadcn/ui new-york + Tailwind v4 CSS variables in `src/index.css`. Add components with `npx shadcn@latest add <name>`.

For detailed conventions, file map, and “where to look first”, use **AGENTS.md**.

<!-- rtk-instructions v2 -->
# RTK (Rust Token Killer) - Token-Optimized Commands

## Golden Rule

**Always prefix commands with `rtk`**. If RTK has a dedicated filter, it uses it. If not, it passes through unchanged. This means RTK is always safe to use.

**Important**: Even in command chains with `&&`, use `rtk`:
```bash
# ❌ Wrong
git add . && git commit -m "msg" && git push

# ✅ Correct
rtk git add . && rtk git commit -m "msg" && rtk git push
```

## RTK Commands by Workflow

### Build & Compile (80-90% savings)
```bash
rtk cargo build         # Cargo build output
rtk cargo check         # Cargo check output
rtk cargo clippy        # Clippy warnings grouped by file (80%)
rtk tsc                 # TypeScript errors grouped by file/code (83%)
rtk lint                # ESLint/Biome violations grouped (84%)
rtk prettier --check    # Files needing format only (70%)
rtk next build          # Next.js build with route metrics (87%)
```

### Test (60-99% savings)
```bash
rtk cargo test          # Cargo test failures only (90%)
rtk go test             # Go test failures only (90%)
rtk jest                # Jest failures only (99.5%)
rtk vitest              # Vitest failures only (99.5%)
rtk playwright test     # Playwright failures only (94%)
rtk pytest              # Python test failures only (90%)
rtk rake test           # Ruby test failures only (90%)
rtk rspec               # RSpec test failures only (60%)
rtk test <cmd>          # Generic test wrapper - failures only
```

### Git (59-80% savings)
```bash
rtk git status          # Compact status
rtk git log             # Compact log (works with all git flags)
rtk git diff            # Compact diff (80%)
rtk git show            # Compact show (80%)
rtk git add             # Ultra-compact confirmations (59%)
rtk git commit          # Ultra-compact confirmations (59%)
rtk git push            # Ultra-compact confirmations
rtk git pull            # Ultra-compact confirmations
rtk git branch          # Compact branch list
rtk git fetch           # Compact fetch
rtk git stash           # Compact stash
rtk git worktree        # Compact worktree
```

Note: Git passthrough works for ALL subcommands, even those not explicitly listed.

### GitHub (26-87% savings)
```bash
rtk gh pr view <num>    # Compact PR view (87%)
rtk gh pr checks        # Compact PR checks (79%)
rtk gh run list         # Compact workflow runs (82%)
rtk gh issue list       # Compact issue list (80%)
rtk gh api              # Compact API responses (26%)
```

### JavaScript/TypeScript Tooling (70-90% savings)
```bash
rtk pnpm list           # Compact dependency tree (70%)
rtk pnpm outdated       # Compact outdated packages (80%)
rtk pnpm install        # Compact install output (90%)
rtk npm run <script>    # Compact npm script output
rtk npx <cmd>           # Compact npx command output
rtk prisma              # Prisma without ASCII art (88%)
```

### Files & Search (60-75% savings)
```bash
rtk ls <path>           # Tree format, compact (65%)
rtk read <file>         # Code reading with filtering (60%)
rtk grep <pattern>      # Search grouped by file (75%). Format flags (-c, -l, -L, -o, -Z) run raw.
rtk find <pattern>      # Find grouped by directory (70%)
```

### Analysis & Debug (70-90% savings)
```bash
rtk err <cmd>           # Filter errors only from any command
rtk log <file>          # Deduplicated logs with counts
rtk json <file>         # JSON structure without values
rtk deps                # Dependency overview
rtk env                 # Environment variables compact
rtk summary <cmd>       # Smart summary of command output
rtk diff                # Ultra-compact diffs
```

### Infrastructure (85% savings)
```bash
rtk docker ps           # Compact container list
rtk docker images       # Compact image list
rtk docker logs <c>     # Deduplicated logs
rtk kubectl get         # Compact resource list
rtk kubectl logs        # Deduplicated pod logs
```

### Network (65-70% savings)
```bash
rtk curl <url>          # Compact HTTP responses (70%)
rtk wget <url>          # Compact download output (65%)
```

### Meta Commands
```bash
rtk gain                # View token savings statistics
rtk gain --history      # View command history with savings
rtk discover            # Analyze Claude Code sessions for missed RTK usage
rtk proxy <cmd>         # Run command without filtering (for debugging)
rtk init                # Add RTK instructions to CLAUDE.md
rtk init --global       # Add RTK to ~/.claude/CLAUDE.md
```

## Token Savings Overview

| Category | Commands | Typical Savings |
|----------|----------|-----------------|
| Tests | vitest, playwright, cargo test | 90-99% |
| Build | next, tsc, lint, prettier | 70-87% |
| Git | status, log, diff, add, commit | 59-80% |
| GitHub | gh pr, gh run, gh issue | 26-87% |
| Package Managers | pnpm, npm, npx | 70-90% |
| Files | ls, read, grep, find | 60-75% |
| Infrastructure | docker, kubectl | 85% |
| Network | curl, wget | 65-70% |

Overall average: **60-90% token reduction** on common development operations.
<!-- /rtk-instructions -->
