import { describe, expect, it } from "vitest"
import { formatAppVersionLabel } from "./app-version"

describe("formatAppVersionLabel", () => {
  it("prefixes a bare semver with v", () => {
    expect(formatAppVersionLabel("1.0.0")).toBe("v1.0.0")
  })

  it("keeps an existing v prefix", () => {
    expect(formatAppVersionLabel("v1.0.0")).toBe("v1.0.0")
  })

  it("returns empty for blank input", () => {
    expect(formatAppVersionLabel("  ")).toBe("")
  })
})
