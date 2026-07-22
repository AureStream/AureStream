# Auth Screenshot Style Design

## Goal

Update Login and Register to match the provided minimalist mobile auth screenshot: clean white/light surface, large left-aligned title, pill inputs, purple primary button, and bottom account-switch link.

## Visual Direction

Use the screenshot as the source of truth:

- No centered glass panel wrapper.
- No card container around the form.
- Root page fills the full auth route area.
- Content starts near the upper-left with generous horizontal padding.
- Title is large, dark, bold, and left aligned.
- Inputs are pill-shaped with a thin gray border and white/transparent fill.
- Email/password icons sit inside the inputs on the left.
- Password and confirm-password inputs include a right-side visibility toggle icon.
- Primary button is a wide purple rounded pill.
- The app auth accent color should use the same soft purple as the login/register button, not green.
- Login/register switch text sits at the bottom center.

## Page Mapping

### Register

Follow the screenshot directly:

- Title: register label.
- Inputs:
  - email
  - password
  - confirm password
- Submit: register label.
- Footer: "Already have an account? Sign in" equivalent.

### Login

Use the same style adapted for login:

- Title: welcome/login label.
- Inputs:
  - email
  - password
- Submit: sign-in label.
- Footer: "No account? Sign up" equivalent.
- Keep success/error messages but render them as minimal inline rounded notices.

## Behavior Requirements

- Preserve existing login and register submit logic.
- Preserve post-login subscription initialization.
- Preserve register password confirmation validation.
- Preserve navigation between login and register.
- Add local password visibility toggles only in UI state; do not change submitted values.

## Acceptance Criteria

- `AuthLayout` still does not wrap auth pages in `glass-panel max-w-[440px]`.
- `LoginPage` and `RegisterPage` match the screenshot structure and spacing closely.
- Register has three pill inputs and one purple pill button.
- Login has two pill inputs and one purple pill button.
- Password fields have right-side visibility toggles.
- Auth pages do not introduce green as a primary accent.
- `pnpm test` passes.
- `pnpm build` passes.

## Non-Goals

- Do not change authentication APIs.
- Do not change global background implementation.
- Do not add dependencies.
- Do not add image assets.
