const PERF_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_PERF_LOG === "1"

/** Lightweight step timing for connect / reload paths (dev or VITE_PERF_LOG=1). */
export const perf = {
  async run<T>(label: string, fn: () => Promise<T>): Promise<T> {
    if (!PERF_ENABLED) {
      return fn()
    }
    const started = performance.now()
    try {
      return await fn()
    } finally {
      console.info(`[perf] ${label} ${(performance.now() - started).toFixed(1)}ms`)
    }
  },
}
