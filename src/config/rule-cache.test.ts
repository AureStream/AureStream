import { describe, expect, it } from "vitest"

import { cacheFileNameForProfile } from "./rule-cache"

describe("sing-box rule cache file names", () => {
  it("matches OneBox rule cache files by proxy mode", () => {
    expect(cacheFileNameForProfile("mixed")).toBe("mixed-cache-rule-v2.db")
    expect(cacheFileNameForProfile("tun")).toBe("tun-cache-rule-v2.db")
  })

  it("matches OneBox global cache file names by proxy mode", () => {
    expect(cacheFileNameForProfile("mixed-global")).toBe("mixed-cache-global-v2.db")
    expect(cacheFileNameForProfile("tun-global")).toBe("tun-cache-global-v2.db")
  })
})
