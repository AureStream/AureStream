import { describe, expect, it } from "vitest"
import { NODE_REGION_FALLBACK, regionCodeForNodeName } from "./node-flag"

describe("regionCodeForNodeName", () => {
  it("matches production-style ISO-city tags", () => {
    expect(regionCodeForNodeName("SG-SIN_82ms | 7.64 MB/s")).toBe("SG")
    expect(regionCodeForNodeName("US-LAX_12ms")).toBe("US")
    expect(regionCodeForNodeName("JP-NRT-01")).toBe("JP")
    expect(regionCodeForNodeName("HK-IEPL")).toBe("HK")
  })

  it("matches Chinese region names", () => {
    expect(regionCodeForNodeName("日本 01")).toBe("JP")
    expect(regionCodeForNodeName("香港专线")).toBe("HK")
    expect(regionCodeForNodeName("美国西海岸")).toBe("US")
    expect(regionCodeForNodeName("台湾 TW")).toBe("TW")
  })

  it("matches English names and cities", () => {
    expect(regionCodeForNodeName("Singapore Premium")).toBe("SG")
    expect(regionCodeForNodeName("Los Angeles-1")).toBe("US")
    expect(regionCodeForNodeName("Frankfurt DE")).toBe("DE")
    expect(regionCodeForNodeName("London")).toBe("GB")
  })

  it("does not treat short codes as substrings inside words", () => {
    // "us" must not match inside "business" / "plus" without a token boundary.
    expect(regionCodeForNodeName("business-plus")).toBe(NODE_REGION_FALLBACK)
    expect(regionCodeForNodeName("edge")).toBe(NODE_REGION_FALLBACK)
  })

  it("prefers longer English phrases over shorter accidental hits", () => {
    expect(regionCodeForNodeName("Hong Kong Node")).toBe("HK")
    expect(regionCodeForNodeName("New Zealand 01")).toBe("NZ")
  })

  it("falls back for empty or unknown names", () => {
    expect(regionCodeForNodeName("")).toBe(NODE_REGION_FALLBACK)
    expect(regionCodeForNodeName(null)).toBe(NODE_REGION_FALLBACK)
    expect(regionCodeForNodeName("节点 A")).toBe(NODE_REGION_FALLBACK)
    expect(regionCodeForNodeName("auto")).toBe(NODE_REGION_FALLBACK)
  })
})
