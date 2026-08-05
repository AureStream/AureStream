import { describe, expect, it } from "vitest"

import { ALL_CONFIG_MODES } from "./common"

describe("config profile modes", () => {
  it("matches AureStream's known modes", () => {
    expect(ALL_CONFIG_MODES).toEqual(["mixed", "tun", "mixed-global", "tun-global"])
  })
})
