# Fail-Open Startup Update Check

## Context

The mandatory-update gate currently treats a failed or timed-out update check as
a blocking state. This prevents the user from opening AureStream when the
updater endpoint is unavailable, even though no newer version has been
confirmed.

## Required Behavior

- Keep the existing startup check and its ten-second hard deadline.
- Continue into the application when the updater reports no available update.
- Continue into the application when the updater check rejects or times out.
- Log update-check failures for diagnostics without showing an error UI.
- Show the mandatory-update screen only when the updater returns a valid update.
- Keep download and installation failures on the mandatory-update screen so the
  user can retry the required update.

## Design

Add a small async policy helper in `src/lib/update-check.ts` that converts an
update-check rejection into `null` while reporting the original error to a
provided logging callback. A successful result, including an existing `null`
result, passes through unchanged.

`ForceUpdateGate` will apply this helper around the deadline-bound updater
request. The component therefore receives only two startup outcomes:

1. A valid update object enters the `required` phase and blocks application use.
2. `null`, whether caused by no update or by a failed check, enters the `ready`
   phase and renders the application.

The obsolete startup `failed` phase, retry counter, retry action, and full-screen
failure UI will be removed. The existing `error` state remains scoped to update
download and installation errors.

## Testing

Unit tests in `src/lib/update-check.test.ts` will prove that the policy helper:

- returns a successful update-check result;
- returns `null` when no update exists;
- returns `null` when the check rejects; and
- returns `null` after the existing deadline rejects a stalled check.

The focused test file and the full frontend test suite will run after the
implementation. A production build will verify TypeScript and bundling.

## Non-Goals

- Changing the updater endpoints, signing, manifest format, or version ordering.
- Allowing users to bypass a confirmed mandatory update.
- Changing update download, installation, or relaunch behavior.
