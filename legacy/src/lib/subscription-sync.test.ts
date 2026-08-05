import { describe, expect, it, vi } from "vitest"

import { syncRemoteSubscriptionsToLocal } from "./subscription-sync"

const sampleRemote = {
  id: "sub-a",
  name: "Plan A",
  url: "https://example.com/a",
  traffic_used: 10,
  traffic_total: 100,
  expire_time: 2000000000,
  created_at: 1,
}

describe("syncRemoteSubscriptionsToLocal", () => {
  it("updates metadata for existing local subscriptions without re-downloading configs", async () => {
    const insertSubscription = vi.fn()
    const updateLocalSubscriptionMeta = vi.fn().mockResolvedValue(undefined)
    const deleteSubscription = vi.fn()

    const result = await syncRemoteSubscriptionsToLocal({
      fetchSubscriptions: vi.fn().mockResolvedValue([sampleRemote]),
      getLocalSubscriptions: vi
        .fn()
        .mockResolvedValueOnce([
          {
            id: "sub-a",
            name: "Old",
            url: "https://example.com/a",
            traffic_used: 1,
            traffic_total: 100,
            expire_time: 1,
            created_at: 1,
          },
        ])
        .mockResolvedValueOnce([
          {
            id: "sub-a",
            name: "Plan A",
            url: "https://example.com/a",
            traffic_used: 10,
            traffic_total: 100,
            expire_time: 2000000000,
            created_at: 1,
          },
        ]),
      deleteSubscription,
      insertSubscription,
      updateLocalSubscriptionMeta,
      getSelectedSubscriptionId: vi.fn().mockResolvedValue("sub-a"),
      setSelectedSubscriptionId: vi.fn(),
      syncActiveConnectionConfig: vi.fn(),
    })

    expect(updateLocalSubscriptionMeta).toHaveBeenCalledWith(sampleRemote)
    expect(insertSubscription).not.toHaveBeenCalled()
    expect(deleteSubscription).not.toHaveBeenCalled()
    expect(result).toHaveLength(1)
  })

  it("downloads config only for newly added remote subscriptions", async () => {
    const insertSubscription = vi.fn().mockResolvedValue("sub-b")
    const updateLocalSubscriptionMeta = vi.fn()
    const planB = { ...sampleRemote, id: "sub-b", url: "https://example.com/b", name: "Plan B" }

    await syncRemoteSubscriptionsToLocal({
      fetchSubscriptions: vi.fn().mockResolvedValue([
        sampleRemote,
        planB,
      ]),
      getLocalSubscriptions: vi
        .fn()
        .mockResolvedValueOnce([{ ...sampleRemote, name: "Plan A" }])
        .mockResolvedValueOnce([
          { ...sampleRemote, name: "Plan A" },
          { ...sampleRemote, id: "sub-b", url: "https://example.com/b", name: "Plan B" },
        ]),
      deleteSubscription: vi.fn(),
      insertSubscription,
      updateLocalSubscriptionMeta,
      getSelectedSubscriptionId: vi.fn().mockResolvedValue("sub-a"),
      setSelectedSubscriptionId: vi.fn(),
      syncActiveConnectionConfig: vi.fn(),
    })

    expect(updateLocalSubscriptionMeta).toHaveBeenCalledWith(sampleRemote)
    // New inserts also get API billing metadata overlaid after download.
    expect(updateLocalSubscriptionMeta).toHaveBeenCalledWith(planB)
    expect(insertSubscription).toHaveBeenCalledTimes(1)
    expect(insertSubscription).toHaveBeenCalledWith(
      "https://example.com/b",
      "Plan B",
      "sub-b"
    )
  })

  it("does not update metadata when insert fails for a new remote", async () => {
    const updateLocalSubscriptionMeta = vi.fn()
    await syncRemoteSubscriptionsToLocal({
      fetchSubscriptions: vi.fn().mockResolvedValue([sampleRemote]),
      getLocalSubscriptions: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]),
      deleteSubscription: vi.fn(),
      insertSubscription: vi.fn().mockResolvedValue(undefined),
      updateLocalSubscriptionMeta,
      getSelectedSubscriptionId: vi.fn().mockResolvedValue(""),
      setSelectedSubscriptionId: vi.fn(),
      syncActiveConnectionConfig: vi.fn(),
    })
    expect(updateLocalSubscriptionMeta).not.toHaveBeenCalled()
  })
})
