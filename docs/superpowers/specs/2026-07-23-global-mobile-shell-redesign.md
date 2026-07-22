# Global Mobile Shell Redesign

## Goal

Make AureStream use one continuous mobile-app background across the global title bar, mobile top bars, and page content. Redesign About, Profile, Login, and Register so they match the Home page's full-screen mobile style instead of centered modal/card layouts.

## Selected Approach

Use Approach A: global background shell ownership.

The app shell owns the network background once, and pages render transparent content layers above it. This avoids duplicated backgrounds, keeps the native window controls visually connected to the content area, and makes authenticated and unauthenticated routes feel like one coherent mobile app.

## Current Context

- `src/main.tsx` renders the global `.app-shell`, `TitleBar`, and `App`.
- `src/components/TitleBar.tsx` is transparent but currently sits above `bg-bg`, not above the programmatic network background.
- `src/components/Dashboard.tsx` currently owns the programmatic network background for authenticated pages only.
- `src/components/MobileTopBar.tsx` is transparent and can remain transparent.
- `src/components/AboutPage.tsx` and `src/components/ProfilePage.tsx` are constrained by `max-w-[420px] mx-auto`, which prevents full-screen page use.
- `src/components/AuthLayout.tsx` wraps login/register in a centered `glass-panel w-full max-w-[440px] rounded-[32px] p-8 md:p-10 flex flex-col relative overflow-hidden`.
- `src/components/LoginPage.tsx` and `src/components/RegisterPage.tsx` are currently form fragments designed to live inside that centered glass panel.

## Design

### Global shell

Move the programmatic network background layers to the app shell in `main.tsx`.

The shell should render:

- base shell container
- global `.app-network-background` layer
- global `.app-network-background-overlay` layer
- foreground app content containing `TitleBar` and routed pages

`TitleBar`, `MobileTopBar`, and page roots should stay transparent so the same background is visible through all vertical regions.

### Dashboard

Remove dashboard-local background layers. The dashboard should become a transparent route container that only owns route layout.

### About page

Redesign About as a full-screen mobile page:

- Root fills all available height and width.
- Remove `max-w-[420px] mx-auto`.
- Keep `MobileTopBar`.
- Use full-width bento/glass cards similar to Home:
  - hero card with logo, platform, app version, sing-box version
  - compact feature grid
  - full-width link/action cards
  - footer note

### Profile page

Redesign Profile as a full-screen mobile page:

- Root fills all available height and width.
- Remove `max-w-[420px] mx-auto`.
- Keep existing auth/subscription data behavior.
- Use full-width mobile cards:
  - user identity card
  - traffic card
  - bottom action area for renew/logout

### Login and Register

Remove the centered modal behavior from `AuthLayout`.

`AuthLayout` should:

- fill the screen
- render language switch at the top-right
- render `<Outlet />` as a full-height route body
- not add a `glass-panel` wrapper
- not add separate decorative blur layers that compete with the global background

`LoginPage` and `RegisterPage` should become full mobile-style pages:

- root fills height and width
- use top brand/welcome section
- use glass input surfaces directly on the page
- keep existing submit/auth logic
- keep navigation links between login and register
- avoid the removed wrapper class string:
  `glass-panel w-full max-w-[440px] rounded-[32px] p-8 md:p-10 flex flex-col relative overflow-hidden`

## Implementation Scope

Expected changed files:

- `src/main.tsx`
- `src/components/Dashboard.tsx`
- `src/components/AuthLayout.tsx`
- `src/components/LoginPage.tsx`
- `src/components/RegisterPage.tsx`
- `src/components/AboutPage.tsx`
- `src/components/ProfilePage.tsx`

Possible CSS changes:

- `src/index.css` only if a small reusable page-shell/helper class is needed.

## Acceptance Criteria

- Global app background is visible behind:
  - native title bar controls
  - mobile top bars
  - route content
- Login and Register no longer use the centered `glass-panel max-w-[440px]` wrapper.
- About and Profile no longer use `max-w-[420px] mx-auto`.
- Dashboard does not duplicate global background layers.
- Home, About, Profile, Login, and Register share the same background system.
- Existing auth, subscription, update, navigation, and external link logic remains unchanged.
- `pnpm test` passes.
- `pnpm build` passes.

## Non-Goals

- Do not add new dependencies.
- Do not add or change shadcn/ui components.
- Do not change backend, subscription merge, proxy, TUN, or sing-box logic.
- Do not change branding assets.
- Do not redesign Nodes page unless required for background consistency.
