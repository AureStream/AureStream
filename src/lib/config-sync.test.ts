import { beforeEach, describe, expect, it, vi } from "vitest"

const invokeMock = vi.hoisted(() => vi.fn())
const getConfigJsonPathMock = vi.hoisted(() => vi.fn())
const mergeConnectionConfigMock = vi.hoisted(() => vi.fn())
const hotReloadConnectionConfigMock = vi.hoisted(() => vi.fn())
const isEngineRunningMock = vi.hoisted(() => vi.fn())
const getEnableTunMock = vi.hoisted(() => vi.fn())
const getStoreValueMock = vi.hoisted(() => vi.fn())

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}))

vi.mock("@/lib/app-paths", () => ({
  getConfigJsonPath: getConfigJsonPathMock,
}))

vi.mock("@/lib/connection-config", () => ({
  mergeConnectionConfig: mergeConnectionConfigMock,
}))

vi.mock("@/lib/hot-reload-config", () => ({
  hotReloadConnectionConfig: hotReloadConnectionConfigMock,
  isEngineRunning: isEngineRunningMock,
}))

vi.mock("@/single/store", () => ({
  getEnableTun: getEnableTunMock,
  getStoreValue: getStoreValueMock,
}))

vi.mock("@/lib/perf", () => ({
  perf: {
    run: (_label: string, work: () => unknown) => work(),
  },
}))

describe("config sync connect guard", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    getConfigJsonPathMock.mockResolvedValue("/tmp/aurestream/config.json")
    invokeMock.mockResolvedValue(undefined)
    isEngineRunningMock.mockResolvedValue(false)
    getEnableTunMock.mockResolvedValue(false)
    getStoreValueMock.mockImplementation(async (key: string, fallback?: unknown) => {
      if (key === "selected_subscription_identifier") return "sub-a"
      if (key === "routing_mode") return "rule"
      return fallback
    })
  })

  it("waits for an in-flight idle merge instead of merging again on connect", async () => {
    let releaseMerge!: () => void
    mergeConnectionConfigMock.mockImplementationOnce(
      () => new Promise<boolean>((resolve) => {
        releaseMerge = () => resolve(true)
      }),
    )

    const { ensureConnectionConfigReady, syncActiveConnectionConfig } = await import("./config-sync")

    const syncPromise = syncActiveConnectionConfig("inputs-changed")
    await vi.waitFor(() => expect(mergeConnectionConfigMock).toHaveBeenCalledTimes(1))

    const readyPromise = ensureConnectionConfigReady("sub-a", "rule", false)
    releaseMerge()

    await syncPromise
    await readyPromise

    expect(mergeConnectionConfigMock).toHaveBeenCalledTimes(1)
    expect(invokeMock).toHaveBeenCalledWith("mark_config_verified", {
      configPath: "/tmp/aurestream/config.json",
    })
  })
})
