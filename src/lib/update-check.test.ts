import { afterEach, describe, expect, it, vi } from "vitest";
import {
  UPDATE_CHECK_DEADLINE_MS,
  UPDATE_ENDPOINT_TIMEOUT_MS,
  withUpdateCheckDeadline,
} from "./update-check";

afterEach(() => {
  vi.useRealTimers();
});

describe("update check deadline", () => {
  it("budgets two endpoint attempts inside the hard deadline", () => {
    expect(UPDATE_ENDPOINT_TIMEOUT_MS * 2).toBe(UPDATE_CHECK_DEADLINE_MS);
  });

  it("returns a completed version check result", async () => {
    await expect(withUpdateCheckDeadline(Promise.resolve("current"))).resolves.toBe(
      "current",
    );
  });

  it("fails when the version check reaches the ten-second deadline", async () => {
    vi.useFakeTimers();
    const result = withUpdateCheckDeadline(new Promise<never>(() => {}));
    const assertion = expect(result).rejects.toThrow("update_check_timeout");

    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_DEADLINE_MS);
    await assertion;
  });
});
