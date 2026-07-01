import { describe, expect, it, vi } from "vitest"

vi.mock("@tauri-apps/plugin-os", () => ({
  locale: vi.fn(),
}))

vi.mock("@tauri-apps/plugin-store", () => ({
  LazyStore: class {
    async get() {
      return undefined
    }
    async set() {}
    async save() {}
    async keys() {
      return []
    }
    async delete() {}
  },
}))

describe("config template URLs", () => {
  it("defaults to AureStream-Config instead of OneOhCloud conf-template", async () => {
    const { getDefaultConfigTemplateURL } = await import("./store")

    const url = await getDefaultConfigTemplateURL("tun")

    expect(url).toBe("https://raw.githubusercontent.com/BadKid90s/AureStream-Config/main/1.13/zh-cn/tun-rules.jsonc")
    expect(url).not.toContain("oneoh.cloud")
    expect(url).not.toContain("OneOhCloud")
    expect(url).not.toContain("conf-template")
  })
})
