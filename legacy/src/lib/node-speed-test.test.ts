import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  NODE_SPEED_TEST_TIMEOUT_MS,
  testNodeTcpLatency,
} from "./node-speed-test"

const invokeMock = vi.hoisted(() => vi.fn())

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}))

describe("node TCP speed test", () => {
  beforeEach(() => {
    invokeMock.mockReset()
  })

  it("uses direct TCP ping with a 5s timeout", async () => {
    invokeMock.mockResolvedValue(128)

    await expect(
      testNodeTcpLatency({
        id: "node-a",
        server: "example.com",
        port: 443,
      }),
    ).resolves.toBe(128)

    expect(invokeMock).toHaveBeenCalledWith("ping_tcp", {
      host: "example.com",
      port: 443,
      timeoutMs: NODE_SPEED_TEST_TIMEOUT_MS,
    })
  })

  it("returns timeout when endpoint data is incomplete", async () => {
    await expect(
      testNodeTcpLatency({
        id: "node-a",
        server: "",
        port: 0,
      }),
    ).resolves.toBe(-1)

    expect(invokeMock).not.toHaveBeenCalled()
  })

  it("returns timeout after the configured deadline even when the backend call is still pending", async () => {
    vi.useFakeTimers()
    try {
      invokeMock.mockReturnValue(new Promise(() => {}))

      const latencyPromise = testNodeTcpLatency(
        {
          id: "node-a",
          server: "example.com",
          port: 443,
        },
        5000,
      )

      await vi.advanceTimersByTimeAsync(4999)
      await expect(Promise.race([latencyPromise, Promise.resolve("pending")])).resolves.toBe("pending")

      await vi.advanceTimersByTimeAsync(1)
      await expect(latencyPromise).resolves.toBe(-1)
    } finally {
      vi.useRealTimers()
    }
  })
})
