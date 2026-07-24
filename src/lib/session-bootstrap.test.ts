import { beforeEach, describe, expect, it, vi } from "vitest"

const fetchSubscriptionsMock = vi.hoisted(() => vi.fn())
const getLocalSubscriptionsMock = vi.hoisted(() => vi.fn())
const deleteSubscriptionMock = vi.hoisted(() => vi.fn())
const insertSubscriptionMock = vi.hoisted(() => vi.fn())
const updateLocalSubscriptionMetaMock = vi.hoisted(() => vi.fn())
const getStoreValueMock = vi.hoisted(() => vi.fn())
const setStoreValueMock = vi.hoisted(() => vi.fn())
const syncActiveConnectionConfigMock = vi.hoisted(() => vi.fn())

vi.mock("../api/subscriptions", () => ({
  fetchSubscriptions: fetchSubscriptionsMock,
}))

vi.mock("../action/db", () => ({
  getLocalSubscriptions: getLocalSubscriptionsMock,
  deleteSubscription: deleteSubscriptionMock,
  insertSubscription: insertSubscriptionMock,
  updateLocalSubscriptionMeta: updateLocalSubscriptionMetaMock,
}))

vi.mock("../single/store", () => ({
  getStoreValue: getStoreValueMock,
  setStoreValue: setStoreValueMock,
}))

vi.mock("./config-sync", () => ({
  syncActiveConnectionConfig: syncActiveConnectionConfigMock,
}))

describe("session-bootstrap", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    syncActiveConnectionConfigMock.mockResolvedValue(true)
    getStoreValueMock.mockResolvedValue("sub-a")
    setStoreValueMock.mockResolvedValue(undefined)
    deleteSubscriptionMock.mockResolvedValue(undefined)
    updateLocalSubscriptionMetaMock.mockResolvedValue(undefined)
    insertSubscriptionMock.mockResolvedValue("sub-a")
  })

  it("login mode rejects empty remote subscription list", async () => {
    fetchSubscriptionsMock.mockResolvedValue([])
    getLocalSubscriptionsMock.mockResolvedValue([])

    const { bootstrapSessionData, resetSessionBootstrapState } = await import("./session-bootstrap")
    resetSessionBootstrapState()

    await expect(bootstrapSessionData("login")).rejects.toThrow(
      "当前账号没有可用订阅或订阅配置拉取失败"
    )
  })

  it("login mode syncs remote subs and marks bootstrap fresh", async () => {
    const remote = [
      {
        id: "sub-a",
        name: "Plan A",
        url: "https://example.com/a",
        traffic_used: 1,
        traffic_total: 100,
        expire_time: 2000000000,
        created_at: 1,
      },
    ]
    fetchSubscriptionsMock.mockResolvedValue(remote)
    getLocalSubscriptionsMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(remote)

    const {
      bootstrapSessionData,
      isBootstrapDataFresh,
      resetSessionBootstrapState,
    } = await import("./session-bootstrap")
    resetSessionBootstrapState()

    await bootstrapSessionData("login")

    expect(insertSubscriptionMock).toHaveBeenCalledWith(
      "https://example.com/a",
      "Plan A",
      "sub-a"
    )
    expect(syncActiveConnectionConfigMock).toHaveBeenCalledWith("login-init")
    expect(isBootstrapDataFresh()).toBe(true)
  })

  it("restore mode coalesces concurrent calls into one sync", async () => {
    let release!: () => void
    const remote = [
      {
        id: "sub-a",
        name: "Plan A",
        url: "https://example.com/a",
        traffic_used: 1,
        traffic_total: 100,
        expire_time: 2000000000,
        created_at: 1,
      },
    ]
    fetchSubscriptionsMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve(remote)
        })
    )
    getLocalSubscriptionsMock.mockResolvedValue(remote)

    const { bootstrapSessionData, resetSessionBootstrapState } = await import("./session-bootstrap")
    resetSessionBootstrapState()

    const p1 = bootstrapSessionData("restore")
    const p2 = bootstrapSessionData("restore")
    release()
    await Promise.all([p1, p2])

    expect(fetchSubscriptionsMock).toHaveBeenCalledTimes(1)
    expect(syncActiveConnectionConfigMock).toHaveBeenCalledWith("session-restore")
  })

  it("restore mode reuses completed work within the same generation (StrictMode)", async () => {
    const remote = [
      {
        id: "sub-a",
        name: "Plan A",
        url: "https://example.com/a",
        traffic_used: 1,
        traffic_total: 100,
        expire_time: 2000000000,
        created_at: 1,
      },
    ]
    fetchSubscriptionsMock.mockResolvedValue(remote)
    getLocalSubscriptionsMock.mockResolvedValue(remote)

    const { bootstrapSessionData, resetSessionBootstrapState } = await import("./session-bootstrap")
    resetSessionBootstrapState()

    await bootstrapSessionData("restore")
    await bootstrapSessionData("restore")

    expect(fetchSubscriptionsMock).toHaveBeenCalledTimes(1)
    expect(syncActiveConnectionConfigMock).toHaveBeenCalledTimes(1)
  })

  it("login mode awaits config sync before resolving", async () => {
    const remote = [
      {
        id: "sub-a",
        name: "Plan A",
        url: "https://example.com/a",
        traffic_used: 1,
        traffic_total: 100,
        expire_time: 2000000000,
        created_at: 1,
      },
    ]
    fetchSubscriptionsMock.mockResolvedValue(remote)
    getLocalSubscriptionsMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(remote)

    let resolveSync!: () => void
    let syncStarted = false
    syncActiveConnectionConfigMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          syncStarted = true
          resolveSync = () => resolve()
        })
    )

    const { bootstrapSessionData, resetSessionBootstrapState } = await import("./session-bootstrap")
    resetSessionBootstrapState()

    let finished = false
    const boot = bootstrapSessionData("login").then(() => {
      finished = true
    })

    await vi.waitFor(() => expect(syncStarted).toBe(true))
    expect(finished).toBe(false)
    resolveSync()
    await boot
    expect(finished).toBe(true)
  })
})
