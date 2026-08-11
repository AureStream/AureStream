import { describe, expect, it } from "vitest"
import { flagEmojiForNodeName, NODE_FLAG_FALLBACK } from "./node-flag"

describe("flagEmojiForNodeName", () => {
  it("matches production-style ISO-city tags", () => {
    expect(flagEmojiForNodeName("SG-SIN_82ms | 7.64 MB/s")).toBe("🇸🇬")
    expect(flagEmojiForNodeName("US-LAX_12ms")).toBe("🇺🇸")
    expect(flagEmojiForNodeName("JP-NRT-01")).toBe("🇯🇵")
    expect(flagEmojiForNodeName("HK-IEPL")).toBe("🇭🇰")
  })

  it("matches Chinese region names", () => {
    expect(flagEmojiForNodeName("日本 01")).toBe("🇯🇵")
    expect(flagEmojiForNodeName("香港专线")).toBe("🇭🇰")
    expect(flagEmojiForNodeName("美国西海岸")).toBe("🇺🇸")
    expect(flagEmojiForNodeName("台湾 TW")).toBe("🇹🇼")
  })

  it("matches English names and cities", () => {
    expect(flagEmojiForNodeName("Singapore Premium")).toBe("🇸🇬")
    expect(flagEmojiForNodeName("Los Angeles-1")).toBe("🇺🇸")
    expect(flagEmojiForNodeName("Frankfurt DE")).toBe("🇩🇪")
    expect(flagEmojiForNodeName("London")).toBe("🇬🇧")
  })

  it("does not treat short codes as substrings inside words", () => {
    // "us" must not match inside "business" / "plus" without a token boundary.
    expect(flagEmojiForNodeName("business-plus")).toBe(NODE_FLAG_FALLBACK)
    expect(flagEmojiForNodeName("edge")).toBe(NODE_FLAG_FALLBACK)
  })

  it("prefers longer English phrases over shorter accidental hits", () => {
    expect(flagEmojiForNodeName("Hong Kong Node")).toBe("🇭🇰")
    expect(flagEmojiForNodeName("New Zealand 01")).toBe("🇳🇿")
  })

  it("falls back for empty or unknown names", () => {
    expect(flagEmojiForNodeName("")).toBe(NODE_FLAG_FALLBACK)
    expect(flagEmojiForNodeName(null)).toBe(NODE_FLAG_FALLBACK)
    expect(flagEmojiForNodeName("节点 A")).toBe(NODE_FLAG_FALLBACK)
    expect(flagEmojiForNodeName("auto")).toBe(NODE_FLAG_FALLBACK)
  })
})
