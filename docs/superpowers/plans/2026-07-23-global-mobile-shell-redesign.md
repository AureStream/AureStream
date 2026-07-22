# Global Mobile Shell Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the whole app use one continuous mobile-shell background and redesign About, Profile, Login, and Register as full-screen mobile pages.

**Architecture:** `main.tsx` owns the global background layers. Route containers and top bars stay transparent. Individual pages own only their content layout and card composition.

**Tech Stack:** React 19, TypeScript, Vite 7, Tailwind CSS v4, existing CSS utility classes, existing inline SVG icons.

## Global Constraints

- Do not add new dependencies.
- Do not add or change shadcn/ui components.
- Do not change backend, subscription merge, proxy, TUN, or sing-box logic.
- Do not change branding assets.
- Preserve existing auth, subscription, update, navigation, and external-link behavior.
- `pnpm test` must pass.
- `pnpm build` must pass.

---

## File Structure

- Modify `src/main.tsx`
  - Add global network background and foreground content layers around `TitleBar` and `App`.

- Modify `src/components/Dashboard.tsx`
  - Remove dashboard-local background layers.
  - Keep route container transparent.

- Modify `src/components/AuthLayout.tsx`
  - Remove centered `glass-panel` modal wrapper.
  - Render route outlet as a full-height mobile page surface.

- Modify `src/components/LoginPage.tsx`
  - Convert fragment-style login form into a full-height mobile page.

- Modify `src/components/RegisterPage.tsx`
  - Convert fragment-style register form into a full-height mobile page.

- Modify `src/components/AboutPage.tsx`
  - Remove max-width page constraint.
  - Recompose into full-screen bento/glass sections.

- Modify `src/components/ProfilePage.tsx`
  - Remove max-width page constraint.
  - Recompose into full-screen bento/glass sections.

---

### Task 1: Move Network Background to Global App Shell

**Files:**
- Modify: `src/main.tsx`
- Modify: `src/components/Dashboard.tsx`

**Interfaces:**
- Consumes: existing `.app-network-background` and `.app-network-background-overlay` classes from `src/index.css`.
- Produces: global background behind `TitleBar` and all routes.

- [ ] **Step 1: Verify current duplicated-local background source**

  Run:

  ```bash
  rg -n "app-network-background|app-network-background-overlay" src/main.tsx src/components/Dashboard.tsx
  ```

  Expected before implementation: matches only in `src/components/Dashboard.tsx`.

- [ ] **Step 2: Update `src/main.tsx`**

  Replace the current app shell body:

  ```tsx
  <div className="app-shell flex flex-col h-screen w-screen bg-bg">
    <TitleBar />
    <div className="flex-1 min-h-0">
      <App />
    </div>
  </div>
  ```

  With:

  ```tsx
  <div className="app-shell relative flex h-screen w-screen flex-col overflow-hidden bg-bg">
    <div className="absolute inset-0 app-network-background pointer-events-none z-0" />
    <div className="absolute inset-0 app-network-background-overlay pointer-events-none z-0" />
    <div className="relative z-10 flex h-full min-h-0 flex-col">
      <TitleBar />
      <div className="flex-1 min-h-0">
        <App />
      </div>
    </div>
  </div>
  ```

- [ ] **Step 3: Update `src/components/Dashboard.tsx`**

  Remove these two dashboard-local layers:

  ```tsx
  <div className="absolute inset-0 app-network-background pointer-events-none z-0" />
  <div className="absolute inset-0 app-network-background-overlay pointer-events-none z-0" />
  ```

  Change the root container to:

  ```tsx
  <div className="h-full w-full flex flex-col relative overflow-hidden">
  ```

  Change the content wrapper to:

  ```tsx
  <div className="relative flex flex-col h-full flex-1 min-w-0">
  ```

- [ ] **Step 4: Verify background ownership**

  Run:

  ```bash
  rg -n "app-network-background|app-network-background-overlay" src/main.tsx src/components/Dashboard.tsx
  ```

  Expected after implementation: matches only in `src/main.tsx`.

---

### Task 2: Convert Auth Layout to Full Mobile Shell

**Files:**
- Modify: `src/components/AuthLayout.tsx`

**Interfaces:**
- Consumes: global background from `main.tsx`.
- Produces: full-screen transparent auth route shell with language switch and outlet.

- [ ] **Step 1: Verify removed wrapper exists**

  Run:

  ```bash
  rg -n "glass-panel w-full max-w-\\[440px\\]|Center Modal Area|Background Decorative Blurs" src/components/AuthLayout.tsx
  ```

  Expected before implementation: output contains the centered modal wrapper and decorative blur comments.

- [ ] **Step 2: Replace `AuthLayout` return markup**

  Keep imports and `useTranslation`. Replace the component return with:

  ```tsx
  return (
    <div className="flex h-full w-full flex-col overflow-hidden font-sans">
      <div className="absolute right-4 top-4 z-20 flex items-center gap-3">
        <div className="flex rounded-2xl border border-border-glass bg-surface/35 p-1 shadow-glass backdrop-blur-xl">
          <button
            onClick={() => i18n.changeLanguage("zh")}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${i18n.language.startsWith("zh") ? "glass-active-pill" : "text-text-muted hover:text-text"}`}
          >
            中文
          </button>
          <button
            onClick={() => i18n.changeLanguage("en")}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${!i18n.language.startsWith("zh") ? "glass-active-pill" : "text-text-muted hover:text-text"}`}
          >
            EN
          </button>
        </div>
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  )
  ```

- [ ] **Step 3: Verify centered modal wrapper is gone**

  Run:

  ```bash
  rg -n "glass-panel w-full max-w-\\[440px\\]|Center Modal Area|Background Decorative Blurs" src/components/AuthLayout.tsx
  ```

  Expected: no output and exit code `1`.

---

### Task 3: Redesign Login and Register as Full Pages

**Files:**
- Modify: `src/components/LoginPage.tsx`
- Modify: `src/components/RegisterPage.tsx`

**Interfaces:**
- Consumes: auth route body from `AuthLayout`.
- Produces: full-height login/register pages with unchanged submit behavior.

- [ ] **Step 1: Update page roots**

  Use this root pattern for both pages:

  ```tsx
  <div className="flex h-full w-full flex-col px-5 pb-6 pt-16 animate-fade-in">
  ```

- [ ] **Step 2: Recompose Login page**

  Preserve state, `handleSubmit`, and imports. Replace only returned JSX with a full-page layout:

  - brand section at top
  - alerts below heading
  - form in a `glass-card rounded-[28px] p-5 shadow-glass`
  - bottom register link

- [ ] **Step 3: Recompose Register page**

  Preserve state, validation, `handleSubmit`, and imports. Replace only returned JSX with a full-page layout:

  - brand section at top
  - alert below heading
  - form in a `glass-card rounded-[28px] p-5 shadow-glass`
  - bottom login link

- [ ] **Step 4: Verify removed auth modal assumptions**

  Run:

  ```bash
  rg -n "max-w-\\[440px\\]|glass-panel" src/components/AuthLayout.tsx src/components/LoginPage.tsx src/components/RegisterPage.tsx
  ```

  Expected: no output and exit code `1`.

---

### Task 4: Redesign About and Profile as Full-Screen Pages

**Files:**
- Modify: `src/components/AboutPage.tsx`
- Modify: `src/components/ProfilePage.tsx`

**Interfaces:**
- Consumes: global background and existing `MobileTopBar`.
- Produces: full-width mobile pages with unchanged data behavior.

- [ ] **Step 1: Remove max-width constraints**

  Replace page root class in both files:

  ```tsx
  className="flex flex-col w-full h-full max-w-[420px] mx-auto animate-fade-in"
  ```

  With:

  ```tsx
  className="flex h-full w-full flex-col animate-fade-in"
  ```

- [ ] **Step 2: Recompose About content**

  Use full-width scroll content:

  ```tsx
  <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-5 flex flex-col gap-3.5">
  ```

  Keep all existing feature/link behavior. Replace opaque `bg-white dark:bg-bg-alt` surfaces with `glass-card` or `bg-surface/55 border-border-glass` style surfaces.

- [ ] **Step 3: Recompose Profile content**

  Use full-height content:

  ```tsx
  <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-5 pt-4 flex flex-col gap-4">
  ```

  Keep existing user/subscription/logout/renew logic. Ensure the action area remains near the bottom using a flexible spacer.

- [ ] **Step 4: Verify full-screen constraints**

  Run:

  ```bash
  rg -n "max-w-\\[420px\\]|mx-auto" src/components/AboutPage.tsx src/components/ProfilePage.tsx
  ```

  Expected: no output and exit code `1`.

---

### Task 5: Verify All Changes

**Files:**
- Verify: all changed files

**Interfaces:**
- Consumes: completed Tasks 1–4.
- Produces: validated implementation.

- [ ] **Step 1: Source checks**

  Run:

  ```bash
  rg -n "app-network-background|app-network-background-overlay" src/main.tsx src/components/Dashboard.tsx
  ```

  Expected: matches only in `src/main.tsx`.

  Run:

  ```bash
  rg -n "glass-panel w-full max-w-\\[440px\\]|max-w-\\[420px\\]" src/components/AuthLayout.tsx src/components/LoginPage.tsx src/components/RegisterPage.tsx src/components/AboutPage.tsx src/components/ProfilePage.tsx
  ```

  Expected: no output and exit code `1`.

- [ ] **Step 2: Run tests**

  Run:

  ```bash
  pnpm test
  ```

  Expected: all tests pass.

- [ ] **Step 3: Run build**

  Run:

  ```bash
  pnpm build
  ```

  Expected: TypeScript and Vite build pass.

- [ ] **Step 4: Commit implementation**

  ```bash
  git add src/main.tsx src/components/Dashboard.tsx src/components/AuthLayout.tsx src/components/LoginPage.tsx src/components/RegisterPage.tsx src/components/AboutPage.tsx src/components/ProfilePage.tsx
  git commit -m "feat: unify mobile shell page backgrounds"
  ```

---

## Self-Review

- Spec coverage: global shell, dashboard dedupe, auth full-page redesign, About/Profile full-screen redesign, source checks, tests, and build are covered.
- Placeholder scan: no placeholders remain.
- Type consistency: class names used in the plan match existing CSS classes or existing component-local classes.
