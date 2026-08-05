import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  NODE_SPEED_TEST_TIMEOUT_MS,
  testNodeTcpLatency,
  testNodesTcpLatencyBatch,
} from "./node-speed-test"

const invokeMock = vi.fn()

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}))

describe("node TCP speed test", () => {
  beforeEach(() => {
    invokeMock.mockReset()
  })

  it("uses direct TCP ping with a 5s timeout", async () => {
    invokeMock.mockResolvedValue(42)
    const ms = await testNodeTcpLatency({
      tag: "n1",
      server: "1.2.3.4",
      port: 443,
    })
    expect(ms).toBe(42)
    expect(invokeMock).toHaveBeenCalledWith("ping_tcp", {
      host: "1.2.3.4",
      port: 443,
      timeoutMs: NODE_SPEED_TEST_TIMEOUT_MS,
    })
  })

  it("returns -1 when server is empty", async () => {
    await expect(
      testNodeTcpLatency({ tag: "n1", server: "", port: 443 }),
    ).resolves.toBe(-1)
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it("returns -1 on invoke failure", async () => {
    invokeMock.mockRejectedValue(new Error("Timeout"))
    await expect(
      testNodeTcpLatency({ tag: "n1", server: "1.2.3.4", port: 443 }),
    ).resolves.toBe(-1)
  })

  it("runs batch with concurrency and reports each result", async () => {
    invokeMock.mockImplementation(async (_cmd: string, args: { host: string }) => {
      return args.host === "a" ? 10 : 20
    })
    const results: Record<string, number> = {}
    await testNodesTcpLatencyBatch(
      [
        { tag: "t1", server: "a", port: 1 },
        { tag: "t2", server: "b", port: 2 },
      ],
      (tag, ms) => {
        results[tag] = ms
      },
      { concurrency: 2 },
    )
    expect(results).toEqual({ t1: 10, t2: 20 })
  })
})
