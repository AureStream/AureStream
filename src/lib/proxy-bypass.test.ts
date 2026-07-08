import { describe, expect, it } from "vitest"

import {
  DEFAULT_PROXY_BYPASS_UI,
  normalizeBypassInput,
  parseBypassInputToRuleSet,
  resolveBypassDisplayValue,
  resolveBypassEditorValue,
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

describe("bypass corruption repair", () => {
  it("collapses a concatenated localhost run to a single entry", () => {
    expect(normalizeBypassInput("localhostlocalhostlocalhost")).toBe("localhost")
  })

  it("deduplicates repeated tokens (case-insensitive, first wins)", () => {
    expect(normalizeBypassInput("localhost, 127.0.0.1, localhost, Localhost")).toBe(
      normalizeBypassInput("localhost, 127.0.0.1"),
    )
  })

  it("leaves unrelated domains and IPs untouched", () => {
    expect(normalizeBypassInput("localhost, 10.0.0.0/8, *.local")).toBe(
      normalizeBypassInput("localhost, 10.0.0.0/8, *.local"),
    )
  })
})

describe("network & routing editor value", () => {
  const emptyRules = { domain: [], domain_suffix: [], ip_cidr: [] }

  it("prefers the lossless raw bypass list over the lossy rule-set", () => {
    // The raw list keeps Windows wildcards and *.local; the rule-set round-trip
    // would have rewritten this to "localhost, .local, 127.0.0.1/32, ...".
    const raw = "localhost, 127.0.0.1, ::1, 10.0.0.0/8, *.local, <local>"
    const rules = {
      domain: ["localhost"],
      domain_suffix: [".local"],
      ip_cidr: ["127.0.0.1/32", "::1/128", "10.0.0.0/8"],
    }
    expect(resolveBypassEditorValue(raw, rules)).toBe(normalizeBypassInput(raw))
  })

  it("does not collapse to localhost when the raw list is intact", () => {
    const raw = "localhost, 127.0.0.1, ::1, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, *.local, <local>"
    expect(resolveBypassEditorValue(raw, { domain: ["localhost"], domain_suffix: [], ip_cidr: [] })).toBe(
      normalizeBypassInput(raw),
    )
  })

  it("falls back to the rule-set text when the raw list is empty (legacy)", () => {
    const rules = { domain: ["corp.example.com"], domain_suffix: [], ip_cidr: [] }
    expect(resolveBypassEditorValue("", rules)).toBe("corp.example.com")
  })

  it("falls back to the platform default when both are empty", () => {
    expect(resolveBypassEditorValue("", emptyRules)).toBe(DEFAULT_PROXY_BYPASS_UI)
  })

  it("repairs a concatenated localhost run from the raw store", () => {
    expect(resolveBypassEditorValue("localhostlocalhostlocalhost", emptyRules)).toBe("localhost")
  })
})
