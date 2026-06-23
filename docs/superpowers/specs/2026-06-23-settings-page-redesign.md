# Settings Page Redesign

## Problem

The current settings page (`src/components/SettingsPage.tsx`, 427 lines) is a single scrollable column of cards. Two low-priority sections ("About & Updates" and "System Service") consume excessive vertical space, pushing the "Network & Routing" section below the fold where its bypass-domain textarea becomes unusable. Additionally, store keys are mislabeled (Auto Connect controls TUN), many defined settings are not exposed, and the flat list forces the user to scroll through irrelevant content to find what they need.

## Goal

Replace the single-column scroll with a **left-sidebar + right-content** layout. Expose only the essential settings (9 total), split into 3 navigable categories. Make the About/Service status a compact bar instead of a full card.

## Layout

```
┌──────────────────────────────────────────────┐
│ ┌──────────┐ ┌─────────────────────────────┐ │
│ │          │ │                             │ │
│ │  Sidebar │ │   Content area              │ │
│ │  ~200px  │ │   (only current category)   │ │
│ │          │ │                             │ │
│ │  • 外观  │ │                             │ │
│ │  • 网络  │ │                             │ │
│ │  • 关于  │ │                             │ │
│ │          │ │                             │ │
│ └──────────┘ └─────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

- Sidebar: 3 navigation items (icon + label), selected state highlighted with an accent bar / background color
- Content: only renders the active category. No scrolling to find things.
- Uses existing shadcn/ui components (Card, Button, Badge) that are already installed but unused.

## Categories & Settings

### 1. Appearance & Behavior (外观与运行)

| Setting | Key | Control | Persist |
|---|---|---|---|
| Theme | localStorage `aurestream-theme` | Segmented: System / Dark / Light | `setMode()` from ThemeProvider |
| Language | i18n | Segmented: 中 / EN | `i18n.changeLanguage()` |
| Auto-start on boot | `auto_start_key` | Toggle | `setAutoStart()` |
| Close to tray | `minimize_to_tray_key` | Toggle | `setMinimizeToTray()` |

### 2. Network & Routing (网络与分流)

| Setting | Key | Control | Persist |
|---|---|---|---|
| Proxy port | `proxy_port_key` | Number input (1-65535) | onBlur → `setProxyPort()` |
| Direct DNS | `direct_dns` | Text input | onBlur → `setDirectDNS()` |
| Bypass domains/IPs | `proxy_bypass_key` + `custom_ruleset_direct` | Textarea | onBlur → `setProxyBypass()` + `setCustomRuleSet("direct", …)` |

### 3. About & Maintenance (关于与维护)

Compact info bar (NOT a full card):

- Left: version label + current version number (monospace)
- Middle: update status — "Up to date" or "New version X" badge + Update button
- Right: helper service status dot + label ("Installed" / "Not installed")

No persistent settings exposed here; auto-update config stays at defaults and is not surfaced.

## Removed Settings

These store keys remain functional (set via code / default) but are NOT exposed in the UI to keep the page lean:

- `enable_tun_key` (was mislabeled "Auto Connect") — TUN is toggled from the home page
- `tun_stack_key`, `use_dhcp_key`, `skip_system_proxy_key`, `enable_bypass_router_key`, `allow_lan_key`, `proxy_dns`
- `auto_update_key`, `update_interval_key`, `singbox_api_port_key`, `singbox_api_secret_key`, `user_agent_key`
- Notifications toggle (was never persisted)

## Component Architecture

```
SettingsPage.tsx              ← Layout shell: sidebar + <Outlet> or conditional render
├── SettingsSidebar.tsx       ← 3 nav items, selected state, onClick switches category
├── AppearanceSection.tsx     ← Theme, Language, Auto-start, Close-to-tray
├── NetworkSection.tsx        ← Proxy port, Direct DNS, Bypass textarea
└── AboutSection.tsx          ← Version, Update button, Service status bar
```

Each section is a self-contained component that loads its own settings on mount and persists on change. The parent sets the active category via `useState<string>`.

## Styling

- Use existing `Card`, `CardHeader`, `CardContent` from shadcn/ui (`src/components/ui/card.tsx`) instead of custom `glass-card` divs
- Use existing `Button` from shadcn/ui (`src/components/ui/button.tsx`) for action buttons
- Keep the glassmorphism feel via the existing `glass-card` CSS class on the overall page container
- Toggle switches: reuse the custom `Toggle` component already defined in the current settings page
- Sidebar: bg-surface-active/10 background, rounded-l-xl, accent indicator on selected item

## Data Flow

- Settings load on mount per section (not all at once in a parent useEffect)
- Each control persists independently (onChange for toggles, onBlur for inputs)
- Config cache invalidation (`invalidateConnectionConfigCache`) happens in the existing setter functions — no change needed
- Theme and language continue using their existing providers/APIs (no store involvement)

## Files to Touch

| File | Action |
|---|---|
| `src/components/SettingsPage.tsx` | Rewrite — layout shell with sidebar + category state |
| `src/components/SettingsSidebar.tsx` | New — 3-item nav |
| `src/components/AppearanceSection.tsx` | New — 4 settings |
| `src/components/NetworkSection.tsx` | New — 3 settings |
| `src/components/AboutSection.tsx` | New — compact info bar |
| `src/lib/engine-probe.ts` | No changes |
| `src/single/store.ts` | No changes (already exports needed getters/setters) |

## No Changes

- Store keys, persistence mechanism, debounce behavior
- Config sync / hot-reload pipeline
- ThemeProvider, UpdateContext, i18n setup
- Routing — settings page path stays as is
