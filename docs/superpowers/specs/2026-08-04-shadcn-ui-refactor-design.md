# shadcn UI refactor design

**Date:** 2026-08-04  
**Status:** Approved  

## Decisions

- **Look:** Standard shadcn new-york (slate base), brand purple `#6C5CFF` as `primary`
- **Font:** Inter app-wide (heading + body)
- **Copy:** Chinese-only (i18n already removed)
- **Rollout:** Phased — Phase 0 tokens/components → Phase 1 Auth → later shell/home/nodes/profile

## Phase 0 — Design system

1. `src/index.css`: shadcn semantic CSS variables + Tailwind v4 `@theme inline` mappings  
2. Compatibility aliases for legacy tokens (`bg-bg`, `text-text`, `text-secondary` brand) so unmigrated pages keep working  
3. Inter only in `index.html`  
4. Components: `button`, `card`, `input`, `label`, `separator`, align `switch` to tokens  
5. `cn()` already in `src/lib/utils.ts`

## Phase 1 — Auth

- `AuthLayout`, `LoginPage`, `RegisterPage` use Card / Input / Label / Button  
- Lucide icons where practical  
- No business-logic changes  

## Later phases (out of this batch)

Dashboard shell, MobileHome, Nodes, Profile, About, ForceUpdateGate.

## Non-goals

- Redesign IA / new features  
- Perfect pixel glassmorphism retention  
- Re-introducing i18n  
