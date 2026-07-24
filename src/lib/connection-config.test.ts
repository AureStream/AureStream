import { beforeEach, describe, expect, it, vi } from "vitest"

const setRuleConfigMock = vi.hoisted(() => vi.fn())
const setGlobalConfigMock = vi.hoisted(() => vi.fn())
const computeMergeCacheKeyMock = vi.hoisted(() => vi.fn())
const getLastMergeCacheKeyMock = vi.hoisted(() => vi.fn())
const setLastMergeCacheKeyMock = vi.hoisted(() => vi.fn())

vi.mock("@/config/merger/main", () => ({
  setRuleConfig: setRuleConfigMock,
  setGlobalConfig: setGlobalConfigMock,
}))

vi.mock("@/lib/merge-cache", () => ({
  getLastMergeCacheKey: getLastMergeCacheKeyMock,
  setLastMergeCacheKey: setLastMergeCacheKeyMock,
  invalidateConnectionConfigCache: vi.fn(),
}))

vi.mock("@/lib/merge-cache-key", () => ({
  computeMergeCacheKey: computeMergeCacheKeyMock,
}))

describe("mergeConnectionConfig cache", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    computeMergeCacheKeyMock.mockResolvedValue("key-a")
    getLastMergeCacheKeyMock.mockReturnValue(null)
    setRuleConfigMock.mockResolvedValue(undefined)
    setGlobalConfigMock.mockResolvedValue(undefined)
  })

  it("skips rewrite when cache key matches and force is false", async () => {
    getLastMergeCacheKeyMock.mockReturnValue("key-a")
    const { mergeConnectionConfig } = await import("./connection-config")

    const rewritten = await mergeConnectionConfig("sub-a", "rule", false)

    expect(rewritten).toBe(false)
    expect(setRuleConfigMock).not.toHaveBeenCalled()
    expect(setLastMergeCacheKeyMock).not.toHaveBeenCalled()
  })

  it("rewrites and stores key on cache miss", async () => {
    getLastMergeCacheKeyMock.mockReturnValue(null)
    const { mergeConnectionConfig } = await import("./connection-config")

    const rewritten = await mergeConnectionConfig("sub-a", "rule", false)

    expect(rewritten).toBe(true)
    expect(setRuleConfigMock).toHaveBeenCalledWith("sub-a", false)
    expect(setLastMergeCacheKeyMock).toHaveBeenCalledWith("key-a")
  })

  it("force rewrite even when cache hits", async () => {
    getLastMergeCacheKeyMock.mockReturnValue("key-a")
    const { mergeConnectionConfig } = await import("./connection-config")

    const rewritten = await mergeConnectionConfig("sub-a", "rule", true, { force: true })

    expect(rewritten).toBe(true)
    expect(setRuleConfigMock).toHaveBeenCalledWith("sub-a", true)
    expect(setLastMergeCacheKeyMock).toHaveBeenCalledWith("key-a")
  })
})
