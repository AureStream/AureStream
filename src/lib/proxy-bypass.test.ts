import { describe, expect, it } from "vitest"

import {
  DEFAULT_PROXY_BYPASS_UI,
  normalizeBypassInput,
  parseBypassInputToRuleSet,
  resolveBypassDisplayValue,
  ruleSetToBypassInput,
} from "./proxy-bypass"

describe("proxy bypass display value", () => {
  it("shows default bypass content when no value is saved", () => {
    expect(resolveBypassDisplayValue("")).toBe(DEFAULT_PROXY_BYPASS_UI)
  })

  it("normalizes saved bypass input for display and storage", () => {
    expect(resolveBypassDisplayValue(" localhost； 127.0.0.1\n10.0.0.0/8 ")).toBe(
      normalizeBypassInput("localhost, 127.0.0.1, 10.0.0.0/8"),
    )
  })

  it("converts bypass input into direct route rules", () => {
    expect(parseBypassInputToRuleSet("example.com, *.local, .corp, 10.0.0.0/8, 127.0.0.1, ::1, <local>")).toEqual({
      domain: ["example.com"],
      domain_suffix: [".local", ".corp"],
      ip_cidr: ["10.0.0.0/8", "127.0.0.1/32", "::1/128"],
    })
  })

  it("renders direct route rules back to bypass input", () => {
    expect(ruleSetToBypassInput({
      domain: ["example.com"],
      domain_suffix: [".corp"],
      ip_cidr: ["10.0.0.0/8"],
    })).toBe(normalizeBypassInput("example.com, .corp, 10.0.0.0/8"))
  })
})
