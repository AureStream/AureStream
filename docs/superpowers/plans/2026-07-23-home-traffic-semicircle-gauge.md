# Home Traffic Semicircle Gauge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Home page circular traffic ring with a screenshot-style semicircle gauge.

**Architecture:** Keep all traffic data in `MobileHome.tsx`. Replace only the visual SVG markup in the subscription card top row.

**Tech Stack:** React 19, TypeScript, inline SVG, Tailwind CSS v4.

## Global Constraints

- Do not change traffic calculations.
- Do not change subscription loading behavior.
- Do not redesign the rest of the Home page.
- `pnpm test` must pass.
- `pnpm build` must pass.

---

## Task 1: Replace Circular Ring with Semicircle Gauge

**Files:**
- Modify: `src/components/MobileHome.tsx`

**Interfaces:**
- Consumes: `remainingPercent`, `remainingGBValue`, and `l`.
- Produces: centered semicircle SVG gauge.

- [ ] Verify current circular ring source:

  ```bash
  rg -n "Circular Progress Ring|strokeDashoffset=\\{2 \\* Math\\.PI \\* 40|remainingPercent\\.toFixed\\(0\\)%" src/components/MobileHome.tsx
  ```

- [ ] Replace the top subscription card row with a centered semicircle gauge.

- [ ] Verify the circular ring source is gone and semicircle source exists:

  ```bash
  rg -n "Traffic Semicircle Gauge|pathLength=\"100\"|remainingPercent" src/components/MobileHome.tsx
  ```

## Task 2: Verify

- [ ] Run:

  ```bash
  pnpm test
  ```

- [ ] Run:

  ```bash
  pnpm build
  ```

- [ ] Commit:

  ```bash
  git add docs/superpowers/specs/2026-07-23-home-traffic-semicircle-gauge-design.md docs/superpowers/plans/2026-07-23-home-traffic-semicircle-gauge.md src/components/MobileHome.tsx
  git commit -m "feat: show remaining traffic as semicircle gauge"
  ```

## Self-Review

- Spec coverage: visual replacement, unchanged calculations, tests, and build are covered.
- Placeholder scan: no placeholders remain.
- Type consistency: all referenced values already exist in `MobileHome.tsx`.
