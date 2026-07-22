# Auth Screenshot Style Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update Login and Register to match the provided minimalist mobile auth screenshot.

**Architecture:** Keep `AuthLayout` as the full-screen route shell. `LoginPage.tsx` and `RegisterPage.tsx` own their page-specific form layout, icons, password visibility state, and existing submit logic.

**Tech Stack:** React 19, TypeScript, Vite 7, Tailwind CSS v4, existing project CSS classes.

## Global Constraints

- Do not change authentication APIs.
- Do not change global background implementation.
- Do not add dependencies.
- Do not add image assets.
- Preserve existing login/register submit behavior.
- Use the same soft purple as the login/register primary button for auth accents; do not use green as the auth primary accent.
- Center the auth form block vertically in the page and use approximately 60px high inputs/buttons.
- Add a large, readable top welcome message and center the login/register title text below it.
- `pnpm test` must pass.
- `pnpm build` must pass.

---

## File Structure

- Modify `src/components/LoginPage.tsx`
  - Add password visibility state.
  - Replace current full-page glass-card form with screenshot-style minimalist layout.

- Modify `src/components/RegisterPage.tsx`
  - Add password and confirm-password visibility state.
  - Replace current full-page glass-card form with screenshot-style minimalist layout.

- Modify `src/components/AboutPage.tsx`
  - Replace green primary accent usage with the same soft purple accent where the page currently uses green as a brand color.

---

### Task 1: Redesign Login Page

**Files:**
- Modify: `src/components/LoginPage.tsx`

**Interfaces:**
- Consumes: existing `email`, `password`, `error`, `successMessage`, `submitting`, and `handleSubmit`.
- Produces: screenshot-style login form with password visibility toggle.

- [ ] **Step 1: Source expectation before implementation**

  Run:

  ```bash
  rg -n "glass-card flex flex-col gap-5|login_subtitle" src/components/LoginPage.tsx
  ```

  Expected before implementation: output exists.

- [ ] **Step 2: Add UI state**

  Add:

  ```tsx
  const [showPassword, setShowPassword] = useState(false)
  ```

- [ ] **Step 3: Add eye icon**

  Add `EyeOff` to the local icon map and use it as a button inside the password input.

- [ ] **Step 4: Replace returned JSX**

  Use a root like:

  ```tsx
  <div className="flex h-full w-full flex-col px-10 pb-7 pt-10 animate-fade-in">
  ```

  Add the top welcome message before the middle form area:

  ```tsx
  <div className="pt-18 text-center">
    <p className="text-[26px] font-black leading-tight tracking-tight text-slate-800 dark:text-text">{t("auth_welcome", "欢迎使用 AureStream")}</p>
    <p className="mt-3 text-[14px] font-semibold text-[#6C5CFF]">{t("auth_welcome_subtitle", "安全、快速、简洁的网络连接体验")}</p>
  </div>
  ```

  Center the title and form block inside a flexible middle area:

  ```tsx
  <div className="flex flex-1 flex-col justify-center pb-16">
  ```

  Use pill inputs:

  ```tsx
  className="flex h-14 items-center gap-4 rounded-full border border-slate-300/80 bg-white/55 px-5 text-text shadow-sm"
  ```

  Use a primary button:

  ```tsx
  className="mt-8 flex h-14 w-full cursor-pointer items-center justify-center rounded-full bg-[#6C5CFF] text-base font-extrabold text-white shadow-md transition-all hover:bg-[#6252F4] active:scale-[0.98] disabled:opacity-60"
  ```

---

### Task 2: Redesign Register Page

**Files:**
- Modify: `src/components/RegisterPage.tsx`

**Interfaces:**
- Consumes: existing `email`, `password`, `confirmPassword`, `error`, `submitting`, and `handleSubmit`.
- Produces: screenshot-style register form with two password visibility toggles.

- [ ] **Step 1: Source expectation before implementation**

  Run:

  ```bash
  rg -n "glass-card flex flex-col gap-4|register_subtitle" src/components/RegisterPage.tsx
  ```

  Expected before implementation: output exists.

- [ ] **Step 2: Add UI state**

  Add:

  ```tsx
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  ```

- [ ] **Step 3: Add eye icon**

  Add `EyeOff` to the local icon map and use it as a button inside password inputs.

- [ ] **Step 4: Replace returned JSX**

  Match the screenshot closely:

  - top welcome message
  - title and form block vertically centered in the page
  - title centered
  - three 56px-high pill inputs
  - 56px-high submit button around 32px below inputs
  - bottom centered login link

---

### Task 3: Verify and Commit

**Files:**
- Verify: `src/components/LoginPage.tsx`
- Verify: `src/components/RegisterPage.tsx`
- Verify: `src/components/AboutPage.tsx`

**Interfaces:**
- Consumes: completed Tasks 1 and 2.
- Produces: committed implementation.

- [ ] **Step 1: Source checks**

  Run:

  ```bash
  rg -n "login_subtitle|register_subtitle|glass-card flex flex-col gap-[45]" src/components/LoginPage.tsx src/components/RegisterPage.tsx
  ```

  Expected: no output and exit code `1`.

  Run:

  ```bash
  rg -n "#00BBA7|#0094A0" src/components/AboutPage.tsx src/components/LoginPage.tsx src/components/RegisterPage.tsx
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

- [ ] **Step 4: Commit**

  ```bash
  git add src/components/LoginPage.tsx src/components/RegisterPage.tsx src/components/AboutPage.tsx
  git commit -m "feat: match auth pages to screenshot style"
  ```

---

## Self-Review

- Spec coverage: login and register screenshot structure, password visibility toggles, behavior preservation, tests, and build are covered.
- Placeholder scan: no placeholders remain.
- Type consistency: state names are local and consistent with JSX usage.
