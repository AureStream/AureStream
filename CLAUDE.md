# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AureStream is a cross-platform desktop proxy client built on the mihomo kernel. It uses Tauri 2.0 (Rust backend) + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui (Radix). The UI uses a glassmorphism design language with light/dark theme support.

## Quick Start

```bash
# Install dependencies
npm install

# Development modes
npm run dev              # Frontend dev server only (http://localhost:5173)
npm run dev:desktop      # Full Tauri desktop app with hot reload

# Building & Testing
npm run build           # Production build (typecheck + Vite build)
npm run typecheck       # TypeScript checking for frontend
npm run typecheck:node  # TypeScript checking for Node files

# Tauri operations
npm run tauri           # Pass commands to Tauri CLI
npm run tauri:build     # Build desktop installer

# Development utilities
npm run preview         # Preview built frontend locally
```

## Architecture Overview

### System Architecture

```
┌─────────────────────────────────────────┐
│          Frontend Layer (React 19)       │
│ Pages → Components → Stores (Zustand)   │
│ Tailwind CSS v4 + shadcn/ui             │
├─────────────────────────────────────────┤
│            Tauri IPC Bridge              │
│         (Type-safe Rust bindings)        │
├─────────────────────────────────────────┤
│         Backend Layer (Tauri 2.0/Rust)   │
│ SQLite DB • Proxy Control • Config Mgmt │
├─────────────────────────────────────────┤
│          Mihomo Kernel (Go)              │
└─────────────────────────────────────────┘
```

### Frontend Structure (`src/`)

**Core Components:**

- **Pages**: `Dashboard.tsx` (main page), `Providers.tsx`, `Settings.tsx`
- **Layout**: `Sidebar` navigation rail + `MainContent` page container
- **Dashboard**: Golden ratio layout (61.8%/38.2%), single viewport, glassmorphism design
- **State Management**:
  - `useAppStore`: Theme management (light/dark) with persistence
  - `useProxyStore`: Providers, nodes, connection state, speeds, latency with persistence
- **API Bridge**: `src/lib/api.ts` wraps all Tauri `invoke()` calls with TypeScript types

**Key Features:**

- Manual routing via `currentPage` state (no React Router)
- Seed data in `src/data/seed.ts` for development/demo
- Real-time proxy connection control with Mihomo integration
- Subscription management with automatic updates
- Latency testing and node selection
- Glassmorphism UI with custom Tailwind utilities

**Design System:**

- Custom glass utilities: `glass`, `glass-strong`, `glass-light`, `glass-rail`, `glass-hover`
- Color system via CSS custom properties with dark theme variants
- Breathing animations for connect button (idle: 4s, active: 2s)
- Smooth transitions for theme switching and state changes

### Backend Structure (`src-tauri/`)

**Entry Points:**

- `src-tauri/src/main.rs`: Application entry point
- `src-tauri/src/lib.rs`: Core application logic with Tauri setup

**Database Layer:**

- `src-tauri/src/db.rs`: SQLite database initialization and schema
- Persistent storage for providers, nodes, and configuration

**Command System:**
All Tauri commands are defined in `src-tauri/src/commands/`:

- `proxy.rs`: Proxy control, status, configuration
- `provider.rs`: Provider/subscription management
- `subscription.rs`: Download and manage subscription files
- `mihomo_kernel.rs`: Mihomo sidecar process management
- `system_proxy.rs`: System proxy configuration
- `builtin_config.rs`: Generate Mihomo configuration files

**State Management:**

- `ProxyState`: Mutex-protected proxy configuration and status
- `MihomoKernelState`: Mihomo sidecar process state
- Database-backed persistent storage

### Data Models

**Frontend Types (`src/types/index.ts`):**

```typescript
interface Provider {
  id: string;
  name: string;
  url: string;
  lastUpdated: string;
  nodeCount: number;
  trafficTotalGB?: number; // Total traffic (GB)
  trafficUsedGB?: number; // Used traffic (GB)
  expiresAt?: string; // ISO 8601 expiration
  autoUpdateInterval?: number; // Auto-update interval (minutes)
}

interface Node {
  id: string;
  name: string;
  providerId: string;
  type: string; // vmess, vless, trojan, etc.
  server: string;
  port: number;
  delay?: number; // Latency in ms
  enabled: boolean;
}

interface ProxyStatus {
  isConnected: boolean;
  currentNode?: Node;
  uploadSpeed: number; // Bytes per second
  downloadSpeed: number; // Bytes per second
  latency?: number; // Current latency in ms
}
```

**Backend Models (`src-tauri/src/commands/mod.rs`):**
Parallel TypeScript definitions with camelCase naming convention for JSON serialization.

### Development Patterns

**Code Organization:**

- All UI text in Chinese (zh-CN)
- Component composition over inheritance
- Type safety enforced at frontend-backend boundary
- Consistent error handling with structured responses

**Development Workflow:**

1. Use seed data during development (`src/data/seed.ts`)
2. Run `npm run dev:desktop` for full Tauri integration
3. Hot reload works for both frontend and backend changes
4. SQLite schema is applied when the app initializes (no backward-compat relocation of legacy install paths).

**Testing Strategy:**

- No formal test framework configured yet
- Manual testing recommended for core flows
- Seed data provides consistent test environment
- TODO items in docs indicate areas needing automated tests

## Key Configuration Files

**Build Configuration:**

- `vite.config.ts`: Frontend build and dev server configuration
- `src-tauri/Cargo.toml`: Rust dependencies and build settings
- `src-tauri/tauri.conf.json`: Tauri app metadata and build options

**TypeScript Setup:**

- `@/` alias resolves to `./src/` (configured in both vite.config.ts and tsconfig.json)
- Strict type checking enabled
- Path mapping for clean imports across the codebase

## Environment Variables

**Development:**

- `TAURI_DEV_HOST`: Override default localhost for remote debugging
- Database path configured per OS (Windows/macOS/Linux)

**Production:**

- Mihomo binary bundled with app (`binaries/mihomo`)
- Configuration stored in OS-specific app data directories

## Common Tasks

**Adding New Features:**

1. Define TypeScript interface in `src/types/index.ts`
2. Add Tauri command in appropriate `src-tauri/src/commands/*.rs` file
3. Create API wrapper function in `src/lib/api.ts`
4. Update Zustand store with new state and actions
5. Build React components using shadcn/ui primitives

**Database Operations:**

- Schema changes should be backward compatible
- Use existing patterns in `db.rs` for new tables
- All data access goes through Tauri commands

**UI Development:**

- Use `cn()` utility for conditional class names
- Follow glassmorphism design system in `src/index.css`
- Leverage existing shadcn/ui components
- Maintain golden ratio layout for dashboard

## Troubleshooting

**Common Issues:**

- Mihomo process not starting: Check if binary exists in `binaries/` folder
- Connection failures: Verify NO_PROXY environment variables include localhost
- Port conflicts: Use `npm run dev:desktop` with `TAURI_DEV_HOST` override
- Theme not switching: Clear browser cache or check CSS custom property fallbacks

**Debug Mode:**

- Enable verbose logging in Mihomo kernel configuration
- Check Tauri developer tools console output
- Monitor SQLite database contents for data integrity issues

## Future Work

Tracked in `docs/README.md`（章节「后续改进」）.

## Documentation References

- `README.md`: User-facing feature overview and quick start
- `docs/README.md`: Documentation index and backlog
- `docs/SPEC.md`: Detailed technical specifications and design decisions
- `docs/DESIGN.md`: Architecture overview and technology rationale
- `docs/FEATURE_*.md` / `docs/MIHOMO_SIDECAR.md` / `docs/PLATFORM_TRAY_MODE.md`: Feature and platform notes
