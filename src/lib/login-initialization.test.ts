import { describe, expect, it, vi } from "vitest"

import { initializeAfterLogin } from "./login-initialization"

describe("initializeAfterLogin", () => {
  it("stores the first subscription and kicks off config sync without waiting for merge", async () => {
    const setStoreValue = vi.fn().mockResolvedValue(undefined)
    const insertSubscription = vi.fn().mockResolvedValue("sub-a")
    let resolveSync!: () => void
    const syncActiveConnectionConfig = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSync = resolve
        })
    )

    const initPromise = initializeAfterLogin({
      fetchSubscriptions: vi.fn().mockResolvedValue([
        {
          id: "sub-a",
          name: "Default Plan",
          url: "https://example.com/sub",
          traffic_used: 0,
          traffic_total: 1024,
          expire_time: 0,
          created_at: 0,
        },
      ]),
      setStoreValue,
      insertSubscription,
      syncActiveConnectionConfig,
    })

    await expect(initPromise).resolves.toBeUndefined()
    expect(setStoreValue).toHaveBeenCalledWith("selected_subscription_identifier", "sub-a")
    expect(insertSubscription).toHaveBeenCalledWith("https://example.com/sub", "Default Plan", "sub-a")
    expect(syncActiveConnectionConfig).toHaveBeenCalledWith("login-init")
    resolveSync()
  })

  it("throws when subscription config download fails", async () => {
    await expect(
      initializeAfterLogin({
        fetchSubscriptions: vi.fn().mockResolvedValue([
          {
            id: "sub-a",
            name: "Default Plan",
            url: "https://example.com/sub",
            traffic_used: 0,
            traffic_total: 1024,
            expire_time: 0,
            created_at: 0,
          },
        ]),
        setStoreValue: vi.fn(),
        insertSubscription: vi.fn().mockResolvedValue(undefined),
        syncActiveConnectionConfig: vi.fn(),
      })
    ).rejects.toThrow("订阅配置拉取失败")
  })

  it("throws when subscription initialization fails so login does not navigate early", async () => {
    await expect(
      initializeAfterLogin({
        fetchSubscriptions: vi.fn().mockRejectedValue(new Error("network down")),
        setStoreValue: vi.fn(),
        insertSubscription: vi.fn(),
        syncActiveConnectionConfig: vi.fn(),
      })
    ).rejects.toThrow("network down")
  })
})
