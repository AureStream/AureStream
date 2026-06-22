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
})
