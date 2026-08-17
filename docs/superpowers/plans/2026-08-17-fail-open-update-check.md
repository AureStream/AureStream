# Fail-Open Update Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow AureStream to start silently when the startup update check fails, times out, or reports no update, while retaining the mandatory gate for a confirmed update.

**Architecture:** Add a tested async policy helper that converts update-check rejections into `null` and reports the original error. Apply it at the updater boundary so `ForceUpdateGate` has only two startup outcomes: a valid update enters `required`, and `null` enters `ready`.

**Tech Stack:** React 19, TypeScript, Tauri updater plugin, Vitest 4

## Global Constraints

- Keep the existing ten-second hard deadline and five-second endpoint timeout.
- Update-check failures and timeouts must log diagnostics and show no error UI.
- No update must enter the application.
- Only a valid update object may block the application.
- Confirmed-update download, installation, and relaunch behavior must remain unchanged.

---

### Task 1: Make the startup update gate fail open

**Files:**
- Modify: `src/lib/update-check.test.ts:1-31`
- Modify: `src/lib/update-check.ts:1-24`
- Modify: `src/components/ForceUpdateGate.tsx:1-212`

**Interfaces:**
- Consumes: `withUpdateCheckDeadline<T>(operation: Promise<T>, timeoutMs?: number): Promise<T>` and Tauri updater `check()`.
- Produces: `allowUpdateCheckFailure<T>(operation: Promise<T>, reportFailure: (error: unknown) => void): Promise<T | null>`.

- [ ] **Step 1: Write failing policy tests**

Add the `allowUpdateCheckFailure` import and the following tests to
`src/lib/update-check.test.ts`. The rejection test catches a missing fail-open
branch or missing diagnostic report; the timeout test catches incorrect
composition with the existing deadline.

```typescript
describe("fail-open update check", () => {
  it("returns a successful update result", async () => {
    const update = { version: "0.4.0" };

    await expect(
      allowUpdateCheckFailure(Promise.resolve(update), () => {}),
    ).resolves.toBe(update);
  });

  it("keeps a no-update result", async () => {
    await expect(
      allowUpdateCheckFailure(Promise.resolve(null), () => {}),
    ).resolves.toBeNull();
  });

  it("reports a failed check and returns no update", async () => {
    const failure = new Error("offline");
    const reported: unknown[] = [];

    await expect(
      allowUpdateCheckFailure(Promise.reject(failure), (error) => {
        reported.push(error);
      }),
    ).resolves.toBeNull();
    expect(reported).toEqual([failure]);
  });

  it("returns no update when the hard deadline expires", async () => {
    vi.useFakeTimers();
    const reported: unknown[] = [];
    const result = allowUpdateCheckFailure(
      withUpdateCheckDeadline(new Promise<never>(() => {})),
      (error) => reported.push(error),
    );
    const assertion = expect(result).resolves.toBeNull();

    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_DEADLINE_MS);
    await assertion;
    expect(reported).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm test src/lib/update-check.test.ts`

Expected: FAIL because `allowUpdateCheckFailure` is not exported by
`src/lib/update-check.ts`.

- [ ] **Step 3: Implement the minimal fail-open policy helper**

Append this function to `src/lib/update-check.ts`:

```typescript
export async function allowUpdateCheckFailure<T>(
  operation: Promise<T>,
  reportFailure: (error: unknown) => void,
): Promise<T | null> {
  try {
    return await operation;
  } catch (error) {
    reportFailure(error);
    return null;
  }
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `pnpm test src/lib/update-check.test.ts`

Expected: all update-check tests PASS.

- [ ] **Step 5: Apply the policy at the updater boundary**

Change `src/components/ForceUpdateGate.tsx` as follows:

```typescript
import { Download, Loader2, RefreshCw, ShieldCheck } from "lucide-react"
import {
  allowUpdateCheckFailure,
  UPDATE_ENDPOINT_TIMEOUT_MS,
  withUpdateCheckDeadline,
} from "@/lib/update-check"

type GatePhase = "checking" | "ready" | "required" | "installing"

function checkAtStartup() {
  startupCheck ??= allowUpdateCheckFailure(
    withUpdateCheckDeadline(check({ timeout: UPDATE_ENDPOINT_TIMEOUT_MS })),
    (error) => console.error("startup update check failed", error),
  )
  return startupCheck
}
```

Remove `checkAttempt`, the retry-specific updater request, the startup catch
that enters `failed`, `retryCheck`, and the entire `phase === "failed"` UI.
Run the startup effect once with dependency array `[]`. Keep the successful
branch unchanged: `available` enters `required`; otherwise enter `ready`.
Retain the `error` state and error rendering for `downloadAndInstall` failures.

- [ ] **Step 6: Run focused tests after component integration**

Run: `pnpm test src/lib/update-check.test.ts`

Expected: all update-check tests PASS with no unhandled rejection warning.

- [ ] **Step 7: Run the full frontend test suite**

Run: `pnpm test`

Expected: all Vitest test files PASS.

- [ ] **Step 8: Verify the production build**

Run: `pnpm build`

Expected: TypeScript and Vite build complete successfully.

- [ ] **Step 9: Review the final diff**

Run: `git diff --check`

Expected: no whitespace errors.

Run: `git diff -- src/lib/update-check.ts src/lib/update-check.test.ts src/components/ForceUpdateGate.tsx`

Expected: only the tested fail-open policy, gate integration, and removal of
the obsolete blocking failure UI are present.

- [ ] **Step 10: Commit the implementation**

```bash
git add src/lib/update-check.ts src/lib/update-check.test.ts src/components/ForceUpdateGate.tsx docs/superpowers/plans/2026-08-17-fail-open-update-check.md
git commit -m "fix(ui): fail open when update check fails"
```
