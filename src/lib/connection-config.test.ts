import { describe, expect, it } from "vitest"

import { resolveResidentMergeProfile } from "./connection-profile"

describe("connection config merge profile", () => {
  it("uses a resident rule profile that keeps TUN configured for capture switching", () => {
    expect(resolveResidentMergeProfile("rule")).toMatchObject({
      mode: "resident",
      tun: true,
      customRules: true,
    })
  })

  it("uses a resident global profile that keeps TUN configured for capture switching", () => {
    expect(resolveResidentMergeProfile("global")).toMatchObject({
      mode: "resident-global",
      tun: true,
      customRules: false,
    })
  })
})
