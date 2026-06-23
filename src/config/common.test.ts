import { describe, expect, it } from "vitest"

import {
  ALL_CONFIG_MODES,
  isStaleTemplatePathOverride,
  TEMPLATE_CACHE_SCHEMA_VERSION,
} from "./common"

describe("config template cache metadata", () => {
  it("matches OneBox template modes", () => {
    expect(ALL_CONFIG_MODES).toEqual(["mixed", "tun", "mixed-global", "tun-global"])
  })

  it("detects stale pre-1.13.8 template path overrides", () => {
    expect(isStaleTemplatePathOverride("https://example.com/conf/1.13/zh-cn/tun-rules.jsonc")).toBe(true)
    expect(isStaleTemplatePathOverride("https://example.com/conf/1.13.8/zh-cn/tun-rules.jsonc")).toBe(false)
    expect(isStaleTemplatePathOverride(null)).toBe(false)
  })

  it("bumps schema after switching to OneBox template loading", () => {
    expect(TEMPLATE_CACHE_SCHEMA_VERSION).toBeGreaterThanOrEqual(16)
  })
})
