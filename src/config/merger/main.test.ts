import { beforeEach, describe, expect, it, vi } from "vitest"

const appConfigDirMock = vi.hoisted(() => vi.fn())
const joinMock = vi.hoisted(() => vi.fn())
const resolveResourceMock = vi.hoisted(() => vi.fn())
const existsMock = vi.hoisted(() => vi.fn())
const writeFileMock = vi.hoisted(() => vi.fn())
const createMock = vi.hoisted(() => vi.fn())
const getSubscriptionConfigMock = vi.hoisted(() => vi.fn())
const getSubscriptionMergeRevisionMock = vi.hoisted(() => vi.fn())
const storeValues = vi.hoisted(() => new Map<string, unknown>())
const fetchRemoteTemplateMock = vi.hoisted(() => vi.fn())

vi.mock("@tauri-apps/api/path", () => ({
  appConfigDir: appConfigDirMock,
  join: joinMock,
  resolveResource: resolveResourceMock,
}))

vi.mock("@tauri-apps/plugin-os", () => ({
  type: () => "windows",
}))

vi.mock("@tauri-apps/plugin-fs", () => ({
  BaseDirectory: { AppConfig: "AppConfig" },
  exists: existsMock,
  writeFile: writeFileMock,
  create: createMock,
}))

vi.mock("../../action/db", () => ({
  getSubscriptionConfig: getSubscriptionConfigMock,
  getSubscriptionMergeRevision: getSubscriptionMergeRevisionMock,
}))

vi.mock("../../single/store", async () => {
  return {
    getAllowLan: vi.fn(async () => false),
    getConfiguredDirectDNS: vi.fn(async () => undefined),
    getConfiguredProxyDNS: vi.fn(async () => undefined),
    getControllerSecret: vi.fn(async () => "secret-token"),
    getControllerPort: vi.fn(async () => 9191),
    getCustomRuleSet: vi.fn(async () => ({ domain: [], domain_suffix: [], ip_cidr: [] })),
    getProxyPort: vi.fn(async () => 2345),
    getStoreValue: vi.fn(async (key: string, def: unknown) => {
      if (key === "AppSecretToken") return "secret-token"
      if (key === "AppApiPort") return 9191
      return storeValues.get(key) ?? def
    }),
    getTunStack: vi.fn(async () => "system"),
    getUseDHCP: vi.fn(async () => false),
    isBypassRouterEnabled: vi.fn(async () => true),
    setStoreValue: vi.fn(async (key: string, value: unknown) => {
      storeValues.set(key, value)
    }),
  }
})

vi.mock("../templates/fetch", () => ({
  fetchRemoteTemplate: fetchRemoteTemplateMock,
}))

const legacyTemplateWithoutClashApi = {
  log: { level: "info" },
  dns: {
    servers: [
      { tag: "system", type: "udp", server: "223.5.5.5" },
      { tag: "dns_proxy", type: "tls", server: "8.8.8.8" },
    ],
  },
  inbounds: [
    { tag: "mixed", type: "mixed", listen: "127.0.0.1", listen_port: 6789 },
  ],
  route: {
    rules: [
      { domain: ["direct-tag.oneoh.cloud"], outbound: "direct" },
      { domain: ["proxy-tag.oneoh.cloud"], outbound: "ExitGateway" },
    ],
  },
  experimental: {},
  outbounds: [],
}

describe("config merger", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storeValues.clear()
    appConfigDirMock.mockResolvedValue("C:/Users/test/AppData/Roaming/AureStream")
    joinMock.mockImplementation(async (...parts: string[]) => parts.join("/"))
    resolveResourceMock.mockImplementation(async (value: string) => value)
    existsMock.mockResolvedValue(true)
    writeFileMock.mockResolvedValue(undefined)
    createMock.mockResolvedValue({
      write: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    })
    getSubscriptionConfigMock.mockResolvedValue({
      outbounds: [
        {
          type: "shadowsocks",
          tag: "node-a",
          server: "127.0.0.1",
          server_port: 1080,
          method: "aes-128-gcm",
          password: "mock",
        },
      ],
    })
    getSubscriptionMergeRevisionMock.mockResolvedValue("1:1")
  })

  it("normalizes legacy templates that do not include experimental.clash_api", async () => {
    const { setRuleConfig } = await import("./main")
    fetchRemoteTemplateMock.mockResolvedValue(JSON.stringify(legacyTemplateWithoutClashApi))

    await expect(setRuleConfig("sub-a", false)).resolves.toBeUndefined()

    const lastWriteCall = writeFileMock.mock.calls[writeFileMock.mock.calls.length - 1]
    const written = JSON.parse(new TextDecoder().decode(lastWriteCall?.[1]))
    expect(written.experimental.clash_api).toEqual({
      external_controller: "127.0.0.1:9191",
      secret: "secret-token",
    })
    expect(written.experimental.cache_file).toMatchObject({
      enabled: true,
      store_fakeip: true,
      store_rdrc: true,
    })
  })
})
