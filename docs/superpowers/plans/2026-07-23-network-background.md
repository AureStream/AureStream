# Network Background Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dashboard's static wallpaper image with a lightweight CSS programmatic network-grid background.

**Architecture:** The dashboard shell remains the single owner of the app-wide mobile background. `Dashboard.tsx` renders semantic background layers, while `src/index.css` defines the visual system and theme-specific overrides.

**Tech Stack:** React 19, TypeScript, Vite 7, Tailwind CSS v4, CSS custom properties.

## Global Constraints

- Do not add image assets.
- Do not add runtime dependencies.
- Do not animate the background.
- Do not redesign page layout, card components, branding, logo, icons, or non-background theme tokens.
- Keep the background behind all dashboard child routes.
- Preserve readability in light and dark themes.

---

## File Structure

- Modify `src/components/Dashboard.tsx`
  - Remove the inline `/wallpaper.jpg` background image layer.
  - Render the new CSS-based background layer and keep the existing route shell.

- Modify `src/index.css`
  - Add scoped classes for `.app-network-background` and its pseudo-elements.
  - Add `[data-theme="dark"]` overrides for the same classes.

- Test/verify with existing build checks
  - Run `pnpm build` to verify TypeScript and Vite production build.
  - Inspect source to verify `/wallpaper.jpg` is no longer referenced by `Dashboard.tsx`.

---

### Task 1: Replace Dashboard Wallpaper Layer

**Files:**
- Modify: `src/components/Dashboard.tsx`

**Interfaces:**
- Consumes: existing dashboard route shell and theme state via global `data-theme`.
- Produces: a stable `.app-network-background` DOM layer consumed by CSS.

- [ ] **Step 1: Write source-level expectation**

  Expected final dashboard background structure:

  ```tsx
  <div className="absolute inset-0 app-network-background pointer-events-none z-0" />
  <div className="absolute inset-0 app-network-background-overlay pointer-events-none z-0" />
  ```

  Expected removed behavior:

  ```tsx
  style={{ backgroundImage: "url('/wallpaper.jpg')" }}
  ```

- [ ] **Step 2: Modify `Dashboard.tsx`**

  Replace the current wallpaper and overlay block with:

  ```tsx
  <div className="absolute inset-0 app-network-background pointer-events-none z-0" />
  <div className="absolute inset-0 app-network-background-overlay pointer-events-none z-0" />
  ```

  Keep this wrapper unchanged:

  ```tsx
  <div className="relative z-10 flex flex-col h-full flex-1 min-w-0">
  ```

- [ ] **Step 3: Verify no dashboard wallpaper reference remains**

  Run:

  ```bash
  rg -n "wallpaper\\.jpg|backgroundImage" src/components/Dashboard.tsx
  ```

  Expected: no output and exit code `1`.

- [ ] **Step 4: Commit**

  ```bash
  git add src/components/Dashboard.tsx
  git commit -m "refactor: use css network background layer"
  ```

---

### Task 2: Add CSS Network Background

**Files:**
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `.app-network-background` and `.app-network-background-overlay` classes rendered by `Dashboard.tsx`.
- Produces: programmatic visual background with light/dark variants.

- [ ] **Step 1: Add CSS classes**

  Add this block near the existing background effects section:

  ```css
  .app-network-background {
    background:
      radial-gradient(70% 36% at 6% 8%, rgba(92, 103, 242, 0.26), transparent 65%),
      radial-gradient(58% 36% at 96% 23%, rgba(0, 187, 167, 0.18), transparent 64%),
      radial-gradient(50% 34% at 50% 62%, rgba(96, 165, 250, 0.1), transparent 70%),
      linear-gradient(180deg, #edf4fb 0%, #f8fbff 56%, #ffffff 100%);
  }

  .app-network-background::before,
  .app-network-background::after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .app-network-background::before {
    opacity: 0.36;
    background-image:
      linear-gradient(rgba(92, 103, 242, 0.14) 1px, transparent 1px),
      linear-gradient(90deg, rgba(92, 103, 242, 0.14) 1px, transparent 1px);
    background-size: 38px 38px;
    mask-image: linear-gradient(180deg, #000 0%, transparent 78%);
    -webkit-mask-image: linear-gradient(180deg, #000 0%, transparent 78%);
  }

  .app-network-background::after {
    opacity: 0.55;
    background:
      radial-gradient(circle at 18% 18%, rgba(92, 103, 242, 0.42) 0 2px, transparent 3px),
      radial-gradient(circle at 42% 31%, rgba(0, 187, 167, 0.3) 0 2px, transparent 3px),
      radial-gradient(circle at 73% 19%, rgba(92, 103, 242, 0.3) 0 2px, transparent 3px),
      radial-gradient(circle at 83% 52%, rgba(0, 187, 167, 0.26) 0 2px, transparent 3px);
    mask-image: linear-gradient(180deg, #000 0%, transparent 72%);
    -webkit-mask-image: linear-gradient(180deg, #000 0%, transparent 72%);
  }

  .app-network-background-overlay {
    background: linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.32) 0%,
      rgba(255, 255, 255, 0.08) 42%,
      rgba(248, 250, 252, 0.58) 100%
    );
  }

  [data-theme="dark"] .app-network-background {
    background:
      radial-gradient(70% 38% at 8% 7%, rgba(92, 103, 242, 0.34), transparent 66%),
      radial-gradient(58% 36% at 96% 24%, rgba(0, 187, 167, 0.2), transparent 66%),
      radial-gradient(54% 40% at 50% 64%, rgba(96, 165, 250, 0.12), transparent 72%),
      linear-gradient(180deg, #111827 0%, #0d131a 58%, #0f172a 100%);
  }

  [data-theme="dark"] .app-network-background::before {
    opacity: 0.22;
    background-image:
      linear-gradient(rgba(148, 163, 184, 0.16) 1px, transparent 1px),
      linear-gradient(90deg, rgba(148, 163, 184, 0.16) 1px, transparent 1px);
  }

  [data-theme="dark"] .app-network-background::after {
    opacity: 0.38;
    background:
      radial-gradient(circle at 18% 18%, rgba(129, 140, 248, 0.42) 0 2px, transparent 3px),
      radial-gradient(circle at 42% 31%, rgba(45, 212, 191, 0.26) 0 2px, transparent 3px),
      radial-gradient(circle at 73% 19%, rgba(129, 140, 248, 0.28) 0 2px, transparent 3px),
      radial-gradient(circle at 83% 52%, rgba(45, 212, 191, 0.22) 0 2px, transparent 3px);
  }

  [data-theme="dark"] .app-network-background-overlay {
    background: linear-gradient(
      180deg,
      rgba(0, 0, 0, 0.26) 0%,
      rgba(0, 0, 0, 0.08) 44%,
      rgba(2, 6, 23, 0.58) 100%
    );
  }
  ```

- [ ] **Step 2: Verify CSS selectors exist**

  Run:

  ```bash
  rg -n "app-network-background" src/index.css
  ```

  Expected: selectors for base class, pseudo-elements, overlay, and dark theme overrides.

- [ ] **Step 3: Commit**

  ```bash
  git add src/index.css
  git commit -m "feat: add programmatic network background"
  ```

---

### Task 3: Build Verification

**Files:**
- Verify: `src/components/Dashboard.tsx`
- Verify: `src/index.css`

**Interfaces:**
- Consumes: completed Tasks 1 and 2.
- Produces: verified build output.

- [ ] **Step 1: Run static source checks**

  Run:

  ```bash
  rg -n "wallpaper\\.jpg|backgroundImage" src/components/Dashboard.tsx
  ```

  Expected: no output and exit code `1`.

- [ ] **Step 2: Run production build**

  Run:

  ```bash
  pnpm build
  ```

  Expected: TypeScript check and Vite build complete successfully.

- [ ] **Step 3: Review final diff**

  Run:

  ```bash
  git diff -- src/components/Dashboard.tsx src/index.css
  ```

  Expected: only the dashboard background layer and scoped CSS background classes changed.

- [ ] **Step 4: Final commit if Task 3 required any fixes**

  If verification required fixes, commit them:

  ```bash
  git add src/components/Dashboard.tsx src/index.css
  git commit -m "fix: tune network background verification"
  ```

  If no fixes were required, do not create an empty commit.

---

## Self-Review

- Spec coverage: the plan removes `/wallpaper.jpg`, adds CSS-only background layers, includes light and dark variants, preserves route-level scope, and verifies build output.
- Placeholder scan: no `TBD`, `TODO`, or unspecified implementation steps remain.
- Type consistency: class names are consistent across `Dashboard.tsx` and `src/index.css`.
