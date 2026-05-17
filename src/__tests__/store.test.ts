import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Tauri invoke
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

// Mock mihomo plugin
vi.mock("tauri-plugin-mihomo-api", () => ({
  reloadConfig: vi.fn().mockResolvedValue(undefined),
  getVersion: vi.fn().mockResolvedValue({ meta: false, version: "v1.19.24" }),
  getProxies: vi.fn().mockResolvedValue({ proxies: {} }),
  getGroups: vi.fn().mockResolvedValue({}),
  getGroupByName: vi
    .fn()
    .mockResolvedValue({ name: "AureStream_Node_Selector", now: undefined }),
  selectNodeForGroup: vi.fn().mockResolvedValue(undefined),
  delayGroup: vi.fn().mockResolvedValue({}),
  closeAllConnections: vi.fn().mockResolvedValue(undefined),
}));

// Mock api.ts — 沿用真实导出，仅为新增内核命令提供 stub（避免测试中启动进程）
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    buildRuntimeConfig: vi
      .fn()
      .mockResolvedValue("/mock/runtime/aurestream-mihomo.yaml"),
    startRuntimeEngine: vi.fn().mockResolvedValue(undefined),
    stopProxy: vi.fn().mockResolvedValue("ok"),
  };
});

import { useProxyStore } from "@/stores/appStore";
import type { Provider } from "@/types";

function makeProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: crypto.randomUUID(),
    name: "Test Provider",
    url: "https://example.com/sub.yaml",
    lastUpdated: new Date().toISOString(),
    nodeCount: 5,
    ...overrides,
  };
}

describe("ProxyStore - Provider CRUD", () => {
  beforeEach(() => {
    // Reset store to empty state
    useProxyStore.setState({
      providers: [],
      currentProvider: undefined,
      currentNode: undefined,
      nodes: [],
      isConnecting: false,
      isDisconnecting: false,
      sessionUploadBytes: 0,
      sessionDownloadBytes: 0,
      nodeLatencyByKey: {},
      latencyPendingByNodeId: {},
    });
  });

  it("addProvider adds a provider to the list", async () => {
    const p = makeProvider({ name: "Provider A" });
    await useProxyStore.getState().addProvider(p);

    const { providers } = useProxyStore.getState();
    expect(providers).toHaveLength(1);
    expect(providers[0].name).toBe("Provider A");
  });

  it("addProvider does not affect other providers", async () => {
    const p1 = makeProvider({ name: "A" });
    const p2 = makeProvider({ name: "B" });
    await useProxyStore.getState().addProvider(p1);
    await useProxyStore.getState().addProvider(p2);

    expect(useProxyStore.getState().providers).toHaveLength(2);
  });

  it("updateProvider updates matching provider fields", async () => {
    const p = makeProvider({ name: "Original" });
    await useProxyStore.getState().addProvider(p);
    await useProxyStore.getState().updateProvider(p.id, { name: "Updated" });

    const updated = useProxyStore
      .getState()
      .providers.find((x) => x.id === p.id);
    expect(updated?.name).toBe("Updated");
  });

  it("updateProvider does not affect other providers", async () => {
    const p1 = makeProvider({ id: "a", name: "A" });
    const p2 = makeProvider({ id: "b", name: "B" });
    await useProxyStore.getState().addProvider(p1);
    await useProxyStore.getState().addProvider(p2);
    await useProxyStore.getState().updateProvider("a", { name: "A-updated" });

    const b = useProxyStore.getState().providers.find((x) => x.id === "b");
    expect(b?.name).toBe("B");
  });

  it("updateProvider syncs currentProvider if it is the same", async () => {
    const p = makeProvider({ name: "Current" });
    await useProxyStore.getState().addProvider(p);
    useProxyStore.getState().setCurrentProvider(p);
    await useProxyStore
      .getState()
      .updateProvider(p.id, { name: "Updated Current" });

    expect(useProxyStore.getState().currentProvider?.name).toBe(
      "Updated Current",
    );
  });

  it("deleteProvider removes the provider", async () => {
    const p = makeProvider();
    await useProxyStore.getState().addProvider(p);
    await useProxyStore.getState().deleteProvider(p.id);

    expect(useProxyStore.getState().providers).toHaveLength(0);
  });

  it("deleteProvider clears currentProvider if it was deleted", async () => {
    const p = makeProvider();
    await useProxyStore.getState().addProvider(p);
    useProxyStore.getState().setCurrentProvider(p);
    await useProxyStore.getState().deleteProvider(p.id);

    expect(useProxyStore.getState().currentProvider).toBeUndefined();
  });

  it("deleteProvider does not affect other providers", async () => {
    const p1 = makeProvider({ id: "keep" });
    const p2 = makeProvider({ id: "delete" });
    await useProxyStore.getState().addProvider(p1);
    await useProxyStore.getState().addProvider(p2);
    await useProxyStore.getState().deleteProvider("delete");

    const remaining = useProxyStore.getState().providers;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe("keep");
  });
});

describe("ProxyStore - setCurrentProvider", () => {
  beforeEach(() => {
    useProxyStore.setState({
      providers: [],
      currentProvider: undefined,
      currentNode: undefined,
      nodes: [],
      isConnecting: false,
      isDisconnecting: false,
      sessionUploadBytes: 0,
      sessionDownloadBytes: 0,
      nodeLatencyByKey: {},
      latencyPendingByNodeId: {},
    });
  });

  it("sets the current provider", async () => {
    const p = makeProvider({ name: "My Provider" });
    await useProxyStore.getState().addProvider(p);
    useProxyStore.getState().setCurrentProvider(p);

    expect(useProxyStore.getState().currentProvider?.name).toBe("My Provider");
  });

  it("clears currentNode when switching to a different provider", async () => {
    const p1 = makeProvider({ id: "p1" });
    const p2 = makeProvider({ id: "p2" });
    await useProxyStore.getState().addProvider(p1);
    await useProxyStore.getState().addProvider(p2);
    useProxyStore.getState().setCurrentProvider(p1);

    // Simulate having a current node from p1
    useProxyStore.setState({
      currentNode: {
        id: "n1",
        name: "Node 1",
        providerId: "p1",
        type: "vmess",
        server: "s1.example.com",
        port: 443,
        enabled: true,
      },
    });

    useProxyStore.getState().setCurrentProvider(p2);
    expect(useProxyStore.getState().currentNode).toBeUndefined();
  });

  it("clears currentProvider when set to undefined", async () => {
    const p = makeProvider();
    await useProxyStore.getState().addProvider(p);
    useProxyStore.getState().setCurrentProvider(p);
    useProxyStore.getState().setCurrentProvider(undefined);

    expect(useProxyStore.getState().currentProvider).toBeUndefined();
  });
});

describe("ProxyStore - Provider model", () => {
  it("Provider does not have enabled field", () => {
    const p = makeProvider();
    expect("enabled" in p).toBe(false);
  });

  it("Provider does not have group field", () => {
    const p = makeProvider();
    expect("group" in p).toBe(false);
  });

  it("Provider supports autoUpdateInterval", () => {
    const p = makeProvider({ autoUpdateInterval: 60 });
    expect(p.autoUpdateInterval).toBe(60);
  });

  it("Provider autoUpdateInterval is optional", () => {
    const p = makeProvider();
    expect(p.autoUpdateInterval).toBeUndefined();
  });
});
