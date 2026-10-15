import { describe, expect, it } from "vitest"
import packageJson from "../../package.json"
import { APP_VERSION, formatAppVersionLabel } from "./app-version"

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

  it("exports APP_VERSION formatted from package.json", () => {
    expect(APP_VERSION).toBe(`v${packageJson.version}`)
  })
})

