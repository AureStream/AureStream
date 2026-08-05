import { describe, expect, it } from "vitest"
import { getNodeLatencyTone } from "./node-latency-tone"

describe("node latency tone", () => {
  it("classifies latency into green, yellow, and red tiers", () => {
    expect(getNodeLatencyTone(1).tone).toBe("success")
    expect(getNodeLatencyTone(300).tone).toBe("success")
    expect(getNodeLatencyTone(301).tone).toBe("warning")
    expect(getNodeLatencyTone(800).tone).toBe("warning")
    expect(getNodeLatencyTone(801).tone).toBe("danger")
  })
})
