import { afterEach, describe, expect, it, vi } from "vitest";
import {
  allowUpdateCheckFailure,
  UPDATE_CHECK_DEADLINE_MS,
  UPDATE_ENDPOINT_TIMEOUT_MS,
  withUpdateCheckDeadline,
} from "./update-check";

afterEach(() => {
  vi.useRealTimers();
});

describe("update check deadline", () => {
  it("caps the complete startup check at five seconds", () => {
    expect(UPDATE_CHECK_DEADLINE_MS).toBe(5_000);
  });

  it("budgets two endpoint attempts inside the hard deadline", () => {
    expect(UPDATE_ENDPOINT_TIMEOUT_MS * 2).toBe(UPDATE_CHECK_DEADLINE_MS);
  });

  it("returns a completed version check result", async () => {
    await expect(withUpdateCheckDeadline(Promise.resolve("current"))).resolves.toBe(
      "current",
    );
  });

  it("fails when the version check reaches the five-second deadline", async () => {
    vi.useFakeTimers();
    const result = withUpdateCheckDeadline(new Promise<never>(() => {}));
    const assertion = expect(result).rejects.toThrow("update_check_timeout");

    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_DEADLINE_MS);
    await assertion;
  });
});

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
