# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AureStream is a cross-platform proxy/VPN client built with **Tauri v2** (Rust backend + WebView frontend). It uses **sing-box** as the core network routing engine, running as an external sidecar binary.

## Tech Stack

- **Frontend**: React 19 + TypeScript + Vite 7 + Tailwind CSS v4 + shadcn/ui (new-york style)
- **Backend**: Rust (Tauri v2) with Tokio async runtime
- **VPN Engine**: sing-box v1.13.13 (sidecar binary)
- **Package Manager**: pnpm 11.4.0 (ESM modules)
- **i18n**: i18next (Chinese default, English available)

## Common Commands

```bash
# Development
pnpm dev                    # Start Vite dev server (port 1420, HMR on 1421)
pnpm tauri dev              # Start Tauri dev mode (opens desktop app)

# Build
pnpm build                  # TypeScript check + Vite production build
pnpm tauri build            # Full Tauri build (includes Rust compilation)

# Release pipeline
pnpm release                # Download binaries + build TUN service + build + tauri build

# Utility scripts
pnpm download-binaries      # Download sing-box sidecar binaries and rule databases
pnpm build-tun              # Build Windows TUN service sidecar
pnpm pre-bundle             # Build and sign macOS privileged helper

# Rust (in src-tauri/)
cargo build                 # Build Rust backend
cargo check                 # Quick type check without full compilation
```

## Architecture

### Three-Tier Communication

1. **Frontend → Rust**: Tauri IPC via `invoke()` from `@tauri-apps/api/core`
   - Commands registered in `src-tauri/src/lib.rs`
   - Handlers in `src-tauri/src/commands/`

2. **Rust → Frontend**: Tauri events via `app.emit()`
   - `engine-state`: State machine transitions (Idle/Starting/Running/Stopping/Failed)
   - `tauri-log`: Log messages

3. **Frontend → sing-box**: Direct REST API via Clash API (`experimental.clash_api`)
   - Client in `src/utils/singbox-api/`
   - Used for node selection, delay testing, traffic monitoring

### Engine State Machine

Rust backend implements `Idle → Starting → Running → Stopping → Idle` (with `Failed` error state). Defined in `src-tauri/src/engine/common/state_machine.rs`. Platform-specific implementations:
- `WindowsEngine`: Sidecar + WinINet proxy
- `MacOSEngine`: XPC helper, DNS watcher, watchdog
- `LinuxEngine`: pkexec, systemd-resolved

### Config Generation Pipeline

Template-based merger system in `src/config/merger/`:
- Built-in templates read from local `src/config/templates/config-template.jsonc` (no external network sync)
- Merges templates + subscription nodes + user preferences → `config.json` for sing-box

### Data Persistence

- **Settings**: `settings.json` via `@tauri-apps/plugin-store` (LazyStore) for preferences
- **Database**: `data.db` (SQLite) via `@tauri-apps/plugin-sql` for subscriptions with migrations

### State Management

React Context API (no Redux/Zustand):
- `NavigationContext`: Tab routing (`"home" | "subscription" | "settings"`)
- `SubscriptionContext`: Subscription data + auto-update timer
- `ThemeContext`: Dark/light/system theme

### Privilege Separation

High-privilege operations (TUN, DNS) delegated to platform services:
- Windows: SCM background service (`tun-service/`)
- macOS: XPC privileged helper (`helper/`)
- Linux: pkexec

## Key Directories

```
src/                          # Frontend (React/TypeScript)
├── action/                   # Database CRUD operations
├── components/home/          # Home page panels (Connection, Node, Network, Usage)
├── components/ui/            # shadcn/ui primitives
├── config/merger/            # sing-box config generation
├── contexts/                 # React contexts
├── hooks/                    # Custom hooks (useEngineState, useSubscriptions)
├── lib/                      # Utilities (i18n, routing-mode, proxy-bypass)
├── pages/                    # Page components
├── utils/singbox-api/        # sing-box Clash API client

src-tauri/                    # Rust backend
├── src/commands/             # Tauri command handlers
├── src/core/                 # Process manager, state machine, log rotation
├── src/engine/               # Platform-specific engine implementations
├── sysproxy-rs/              # Cross-platform system proxy library
├── tun-service/              # Windows TUN service
├── helper/                   # macOS privileged helper (XPC)
```

## Path Aliases

TypeScript: `@/*` maps to `./src/*` (configured in `tsconfig.json` and `vite.config.ts`)

## UI Components

Uses shadcn/ui with new-york style. Component configuration in `components.json`. Add new components via:
```bash
npx shadcn@latest add <component-name>
```

## Internationalization

- Translation files: `lang/zh.json` (default), `lang/en.json`
- Detection: OS locale via `@tauri-apps/plugin-os`
- Usage: `useTranslation()` hook from `react-i18next`

## Theming

CSS custom properties (HSL-based) in `src/index.css` with light/dark variants. Tailwind CSS v4 with `@custom-variant dark`. Theme persisted in localStorage.

## Platform-Specific Builds

- `tauri.conf.json`: Base config (all platforms)
- `tauri.windows.conf.json`: Windows-specific (adds tun-service sidecar)
- macOS requires code signing for the privileged helper
- Deep link scheme: `aurestream://`

## Build Scripts

- `scripts/download-binaries.ts`: Fetches sing-box binaries from GitHub releases
- `scripts/build-tun-service.ts`: Compiles Windows TUN service
- `scripts/prebundle.ts`: Builds and signs macOS privileged helper
- `scripts/sync-templates.ts`: Fetches config templates from `OneOhCloud/conf-template`

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