export const UPDATE_CHECK_DEADLINE_MS = 10_000;
export const UPDATE_ENDPOINT_TIMEOUT_MS = 5_000;

export function withUpdateCheckDeadline<T>(
  operation: Promise<T>,
  timeoutMs = UPDATE_CHECK_DEADLINE_MS,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      reject(new Error("update_check_timeout"));
    }, timeoutMs);

    operation.then(
      (value) => {
        globalThis.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        globalThis.clearTimeout(timer);
        reject(error);
      },
    );
  });
}
