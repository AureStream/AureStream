import { beforeEach, describe, expect, it, vi } from "vitest"

type EffectEntry = {
  effect: () => void | (() => void)
  deps?: unknown[]
  cleanup?: void | (() => void)
}

const effects = vi.hoisted(() => [] as EffectEntry[])
const refs = vi.hoisted(() => [] as Array<{ current: unknown }>)
const engineState = vi.hoisted(() => ({ isConnected: false }))
const getStoreValueMock = vi.hoisted(() => vi.fn())
const accumulateUsedTrafficMock = vi.hoisted(() => vi.fn())
const getLocalSubscriptionsMock = vi.hoisted(() => vi.fn())
const uploadPendingTrafficMock = vi.hoisted(() => vi.fn())
const subscribeTrafficMock = vi.hoisted(() => vi.fn())

vi.mock("react", () => ({
  useEffect: (effect: EffectEntry["effect"], deps?: unknown[]) => {
    effects.push({ effect, deps })
  },
  useRef: (initialValue: unknown) => {
    const ref = { current: initialValue }
    refs.push(ref)
    return ref
  },
}))

vi.mock("./useEngineState", () => ({
  useEngineState: () => engineState,
}))

vi.mock("@/single/store", () => ({
  getStoreValue: getStoreValueMock,
}))

vi.mock("@/action/db", () => ({
  accumulateUsedTraffic: accumulateUsedTrafficMock,
  getLocalSubscriptions: getLocalSubscriptionsMock,
  uploadPendingTraffic: uploadPendingTrafficMock,
}))

vi.mock("@/utils/singbox-api/traffic", () => ({
  subscribeTraffic: subscribeTrafficMock,
}))

function runEffects() {
  for (const entry of effects) {
    entry.cleanup = entry.effect()
  }
}

describe("useTrafficAccumulator", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    effects.length = 0
    refs.length = 0
    engineState.isConnected = false
    getStoreValueMock.mockResolvedValue("sub-a")
    accumulateUsedTrafficMock.mockResolvedValue(undefined)
    getLocalSubscriptionsMock.mockResolvedValue([])
    uploadPendingTrafficMock.mockResolvedValue(undefined)
    subscribeTrafficMock.mockResolvedValue(undefined)
  })

  it("does not upload pending traffic during disconnect cleanup", async () => {
    engineState.isConnected = true
    const { useTrafficAccumulator } = await import("./useTrafficAccumulator")

    useTrafficAccumulator()
    refs[0].current = 128
    refs[1].current = 256
    refs[2].current = "sub-a"
    runEffects()

    const cleanup = effects[2].cleanup
    expect(cleanup).toEqual(expect.any(Function))
    await (cleanup as () => Promise<void>)()

    expect(accumulateUsedTrafficMock).toHaveBeenCalledWith("sub-a", 128, 256)
    expect(uploadPendingTrafficMock).not.toHaveBeenCalled()
  })

  it("uploads pending traffic shortly after a stable connected state", async () => {
    vi.useFakeTimers()
    try {
      engineState.isConnected = true
      const { useTrafficAccumulator } = await import("./useTrafficAccumulator")

      useTrafficAccumulator()
      runEffects()

      await vi.advanceTimersByTimeAsync(4999)
      expect(uploadPendingTrafficMock).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1)
      expect(uploadPendingTrafficMock).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
