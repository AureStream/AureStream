import { create } from "zustand";
import type { Provider, Node } from "@/types";
import {
  addProvider as addProviderIpc,
  updateProvider as updateProviderIpc,
  deleteProvider as deleteProviderIpc,
  getProxyConfig,
  getProviders,
  getNodes,
  startProxy,
  downloadSubscription,
  deleteSubscriptionFile,
  getSubscriptionPath,
  testNodeLatency,
  buildRuntimeConfig,
  startRuntimeEngine,
  stopProxy,
  updateProxyConfig,
  updateTrayMenu,
} from "@/lib/api";
import { logErrorDetail, userFacingMessage } from "@/lib/userErrors";
import {
  loadPersistedSettings,
  savePersistedSettings,
  savePersistedState,
  loadPersistedLatencyCache,
  savePersistedLatencyCache,
} from "@/lib/persistStore";
import {
  reloadConfig,
  getGroupByName,
  selectNodeForGroup,
} from "tauri-plugin-mihomo-api";
import {
  AURESTREAM_NODE_SELECTOR,
  DEFAULT_PROXY_BYPASS_DOMAINS,
} from "@/constants/mihomo";

/** 本地持久化测速：订阅 id + 节点 id（与 Mihomo 叶子代理名一致） */
function nodeLatencyCacheKey(providerId: string, nodeId: string): string {
  return `${providerId}:${nodeId}`;
}

interface AppStore {
  theme: "light" | "dark" | "system";
  proxyBypassDomains: string;
  autoStart: boolean;
  autoConnect: boolean;
  proxyMode: "rule" | "global" | "direct";
  /** 从后端 YAML 加载设置 */
  loadSettings: () => Promise<void>;
  setTheme: (theme: "light" | "dark" | "system") => void;
  setProxyBypassDomains: (value: string) => void;
  toggleTheme: () => void;
  setAutoStart: (value: boolean) => void;
  setAutoConnect: (value: boolean) => void;
  setProxyMode: (mode: "rule" | "global" | "direct") => Promise<void>;
}

export const useAppStore = create<AppStore>()((set, get) => ({
  theme: "system",
  proxyBypassDomains: DEFAULT_PROXY_BYPASS_DOMAINS,
  autoStart: false,
  autoConnect: false,
  proxyMode: "rule",

  loadSettings: async () => {
    try {
      const settings = await loadPersistedSettings();
      // 首次迁移：如果 plugin-store 是空的，尝试从旧 IPC 加载一次
      if (!settings.proxyBypassDomains) {
        settings.proxyBypassDomains = DEFAULT_PROXY_BYPASS_DOMAINS;
      }
      set({
        theme: settings.theme,
        proxyBypassDomains: settings.proxyBypassDomains,
        autoStart: settings.autoStart,
        autoConnect: settings.autoConnect,
        proxyMode: (settings as any).proxyMode || "rule",
      });
    } catch (e) {
      console.error("Failed to load app settings:", e);
    }
  },

  setTheme: (theme) => {
    set({ theme });
    savePersistedSettings({ theme }).catch(console.error);
  },

  setProxyBypassDomains: (value) => {
    set({ proxyBypassDomains: value });
    savePersistedSettings({ proxyBypassDomains: value }).catch(console.error);
  },

  toggleTheme: () => {
    const current = get().theme;
    const next =
      current === "light" ? "dark" : current === "dark" ? "system" : "light";
    set({ theme: next });
    savePersistedSettings({ theme: next }).catch(console.error);
  },

  setAutoStart: async (value) => {
    set({ autoStart: value });
    savePersistedSettings({ autoStart: value }).catch(console.error);

    try {
      const { enable, disable } = await import("@tauri-apps/plugin-autostart");
      if (value) {
        await enable();
        // 当打开开机自启动功能后自动打开自动连接功能
        get().setAutoConnect(true);
      } else {
        await disable();
      }
    } catch (e) {
      console.error("Failed to toggle autostart:", e);
    }
  },

  setAutoConnect: (value) => {
    set({ autoConnect: value });
    savePersistedSettings({ autoConnect: value }).catch(console.error);
  },

  setProxyMode: async (mode) => {
    set({ proxyMode: mode });
    savePersistedSettings({ proxyMode: mode } as any).catch(console.error);

    if (useProxyStore.getState().isConnected) {
      try {
        const { patchBaseConfig } = await import("tauri-plugin-mihomo-api");
        await patchBaseConfig({ mode });
      } catch (e) {
        console.error("Failed to update mihomo mode:", e);
      }
    }
  },
}));

// --- Auto-update timers (not persisted, managed in memory) ---
const autoUpdateTimers = new Map<string, ReturnType<typeof setInterval>>();

function clearAutoUpdateTimer(providerId: string) {
  const timer = autoUpdateTimers.get(providerId);
  if (timer) {
    clearInterval(timer);
    autoUpdateTimers.delete(providerId);
  }
}

function setupAutoUpdateTimer(
  providerId: string,
  intervalMinutes: number,
  refreshFn: (id: string) => Promise<unknown>,
) {
  clearAutoUpdateTimer(providerId);
  const timer = setInterval(
    () => {
      refreshFn(providerId);
    },
    intervalMinutes * 60 * 1000,
  );
  autoUpdateTimers.set(providerId, timer);
}

/** Mihomo `/connections` 累计量差分 → 字节/秒（供首页速率展示） */
let mihomoTrafficTimer: ReturnType<typeof setInterval> | null = null;
let mihomoTrafficSnap = {
  uploadTotal: 0,
  downloadTotal: 0,
  t: 0,
  primed: false,
};

function stopMihomoTrafficPoll() {
  if (mihomoTrafficTimer != null) {
    clearInterval(mihomoTrafficTimer);
    mihomoTrafficTimer = null;
  }
  mihomoTrafficSnap = { uploadTotal: 0, downloadTotal: 0, t: 0, primed: false };
}

function startMihomoTrafficPoll(get: () => ProxyStore) {
  stopMihomoTrafficPoll();
  const tick = async () => {
    try {
      const { getConnections } = await import("tauri-plugin-mihomo-api");
      const c = await getConnections();
      const now = Date.now();
      const up = Number(c.uploadTotal ?? 0);
      const down = Number(c.downloadTotal ?? 0);
      if (!mihomoTrafficSnap.primed) {
        mihomoTrafficSnap = {
          uploadTotal: up,
          downloadTotal: down,
          t: now,
          primed: true,
        };
        get().applyMihomoTrafficTick(0, 0, up, down);
        return;
      }
      const dt = (now - mihomoTrafficSnap.t) / 1000;
      if (dt < 0.05) return;
      let ul = (up - mihomoTrafficSnap.uploadTotal) / dt;
      let dl = (down - mihomoTrafficSnap.downloadTotal) / dt;
      if (!Number.isFinite(ul) || ul < 0) ul = 0;
      if (!Number.isFinite(dl) || dl < 0) dl = 0;
      get().applyMihomoTrafficTick(ul, dl, up, down);
      mihomoTrafficSnap = {
        uploadTotal: up,
        downloadTotal: down,
        t: now,
        primed: true,
      };
    } catch {
      const st = get();
      st.applyMihomoTrafficTick(
        0,
        0,
        st.sessionUploadBytes,
        st.sessionDownloadBytes,
      );
    }
  };
  void tick();
  mihomoTrafficTimer = setInterval(() => void tick(), 1000);
}

/** 校正当前选中订阅：仅存 1 条时一律视为当前使用中；零条清空；多条时校正无效引用 */
function normalizeCurrentSubscriptionSelection(
  providers: Provider[],
  currentProvider: Provider | undefined,
  currentNode: Node | undefined,
): { currentProvider: Provider | undefined; currentNode: Node | undefined } {
  if (providers.length === 0) {
    return { currentProvider: undefined, currentNode: undefined };
  }
  if (providers.length === 1) {
    const only = providers[0];
    const nodeOk =
      currentNode?.providerId === only.id ? currentNode : undefined;
    return { currentProvider: only, currentNode: nodeOk };
  }
  if (currentProvider && !providers.some((p) => p.id === currentProvider.id)) {
    return { currentProvider: undefined, currentNode: undefined };
  }
  const nodeOk =
    currentNode &&
    currentProvider &&
    currentNode.providerId === currentProvider.id
      ? currentNode
      : undefined;
  return { currentProvider, currentNode: nodeOk };
}

interface ProxyStore {
  providers: Provider[];
  nodes: Node[];
  currentProvider?: Provider;
  currentNode?: Node;
  isConnected: boolean;
  isConnecting: boolean;
  /** 正在执行断开（关闭内核与系统代理），避免重复点击 */
  isDisconnecting: boolean;
  connectedAt?: number;
  connectedIp?: string;
  uploadSpeed: number;
  downloadSpeed: number;
  /** 当前 Mihomo 会话累计上传量（字节，来自 getConnections.uploadTotal） */
  sessionUploadBytes: number;
  /** 当前 Mihomo 会话累计下载量（字节，来自 getConnections.downloadTotal） */
  sessionDownloadBytes: number;
  isTestingLatency: boolean;
  /** 本轮一键测速尚未完成的节点 id（用于每行显示刷新动画，含已有旧延迟的重测） */
  latencyPendingByNodeId: Record<string, boolean>;
  /** 正在更新的 provider ID 集合 */
  refreshingIds: Set<string>;
  /** 上次一键测速结果（按订阅+节点缓存，持久化以便再次打开列表仍显示） */
  nodeLatencyByKey: Record<string, number>;

  /** 从后端 YAML 加载延迟缓存 */
  loadCache: () => Promise<void>;
  /** 从数据库加载所有 provider 和 node */
  loadProviders: () => Promise<void>;
  addProvider: (provider: Provider, skipIpc?: boolean) => Promise<void>;
  updateProvider: (id: string, updates: Partial<Provider>) => Promise<void>;
  deleteProvider: (id: string) => Promise<void>;
  setCurrentProvider: (provider?: Provider) => void;
  setCurrentNode: (node?: Node) => void;
  /** 选择节点并在已连接时同步到 Mihomo Selector */
  applyNodeSelection: (node?: Node) => Promise<void>;
  /** 从 SQLite endpoints 同步节点列表（与 Mihomo /proxies 解耦） */
  refreshSubscriptionNodesFromDb: () => Promise<void>;
  setNodes: (nodes: Node[]) => void;
  updateNodeDelay: (nodeId: string, delay: number) => void;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  setConnectStatus: (isConnected: boolean) => void;
  setConnectingStatus: (isConnecting: boolean) => void;
  updateSpeeds: (upload: number, download: number) => void;
  /** 由 Mihomo 流量轮询一次性写入速率与本会话累计字节 */
  applyMihomoTrafficTick: (
    upBps: number,
    downBps: number,
    sessionUpBytes: number,
    sessionDownBytes: number,
  ) => void;
  testLatency: (skipPersist?: boolean) => Promise<void>;
  /** 下载订阅配置文件并更新 provider 元数据 */
  fetchAndSaveSubscription: (
    id: string,
  ) => Promise<{ success: boolean; error?: string }>;
  /** 设置当前订阅并通知 mihomo 加载配置 */
  setCurrentSubscription: (provider?: Provider) => Promise<void>;
  /** 初始化所有 provider 的自动更新定时器 */
  initAutoUpdateTimers: () => void;
}

export const useProxyStore = create<ProxyStore>()((set, get) => ({
  providers: [],
  nodes: [],
  currentProvider: undefined,
  currentNode: undefined,
  isConnected: false,
  isConnecting: false,
  isDisconnecting: false,
  connectedAt: undefined,
  connectedIp: undefined,
  uploadSpeed: 0,
  downloadSpeed: 0,
  sessionUploadBytes: 0,
  sessionDownloadBytes: 0,
  isTestingLatency: false,
  latencyPendingByNodeId: {},
  refreshingIds: new Set<string>(),
  nodeLatencyByKey: {},

  loadCache: async () => {
    try {
      const cache = await loadPersistedLatencyCache();
      set({ nodeLatencyByKey: cache });
    } catch (e) {
      console.error("Failed to load latency cache:", e);
    }
  },

  loadProviders: async () => {
    try {
      const [providers, nodes] = await Promise.all([
        getProviders(),
        getNodes(),
      ]);
      const cur = normalizeCurrentSubscriptionSelection(
        providers,
        get().currentProvider,
        get().currentNode,
      );
      set({ providers, nodes, ...cur });
    } catch (e) {
      console.error("Failed to load providers from DB:", e);
    }
  },

  addProvider: async (provider, skipIpc = false) => {
    if (!skipIpc) {
      await addProviderIpc(provider);
    }
    const providers = [...get().providers, provider];
    set({ providers });
    if (provider.autoUpdateInterval) {
      setupAutoUpdateTimer(
        provider.id,
        provider.autoUpdateInterval,
        get().fetchAndSaveSubscription,
      );
    }
    // 添加后若仅有这一条订阅，自动设为「使用中」
    if (providers.length === 1) {
      await get().setCurrentSubscription(provider);
    }
  },

  updateProvider: async (id, updates) => {
    const prev = get().providers.find((p) => p.id === id);
    if (!prev) return;
    const merged = { ...prev, ...updates };
    await updateProviderIpc(id, merged as Provider);
    set({
      providers: get().providers.map((p) => (p.id === id ? merged : p)),
    });
    // 更新自动更新定时器
    if (updates.autoUpdateInterval !== undefined) {
      if (updates.autoUpdateInterval) {
        setupAutoUpdateTimer(
          id,
          updates.autoUpdateInterval,
          get().fetchAndSaveSubscription,
        );
      } else {
        clearAutoUpdateTimer(id);
      }
    }
    // 同步 currentProvider
    if (get().currentProvider?.id === id) {
      set({ currentProvider: merged as Provider });
    }
  },

  deleteProvider: async (id) => {
    clearAutoUpdateTimer(id);
    await deleteProviderIpc(id);
    const newProviders = get().providers.filter((p) => p.id !== id);
    let currentProvider = get().currentProvider;
    if (currentProvider?.id === id) {
      // 删除当前使用的订阅后，自动选第一个剩余订阅
      currentProvider = newProviders.length > 0 ? newProviders[0] : undefined;
    }
    const sel = normalizeCurrentSubscriptionSelection(
      newProviders,
      currentProvider,
      get().currentNode,
    );
    const prefix = `${id}:`;
    set((state) => {
      const nodeLatencyByKey = { ...state.nodeLatencyByKey };
      for (const k of Object.keys(nodeLatencyByKey)) {
        if (k.startsWith(prefix)) delete nodeLatencyByKey[k];
      }
      return { providers: newProviders, ...sel, nodeLatencyByKey };
    });
    savePersistedLatencyCache(get().nodeLatencyByKey).catch(console.error);
    // 删除订阅文件
    deleteSubscriptionFile(id).catch(() => {});
  },

  setCurrentProvider: (provider) => {
    const cur = get().currentNode;
    const nextNode =
      provider && cur?.providerId === provider.id ? cur : undefined;
    set({
      currentProvider: provider,
      currentNode: nextNode,
    });
  },

  setCurrentNode: (node) => set({ currentNode: node }),

  applyNodeSelection: async (node) => {
    set({ currentNode: node });
    if (!node || !get().isConnected) return;
    try {
      await selectNodeForGroup(AURESTREAM_NODE_SELECTOR, node.name);
      // 关闭已有连接，强制后续请求立即走新节点
      try {
        const { closeAllConnections } = await import("tauri-plugin-mihomo-api");
        await closeAllConnections();
      } catch {
        // closeAllConnections 失败不影响节点切换本身
      }
    } catch (e) {
      console.error("切换节点失败:", e);
    }
  },

  refreshSubscriptionNodesFromDb: async () => {
    const { currentProvider } = get();
    if (!currentProvider) return;
    if (get().isTestingLatency) return;
    try {
      const freshAll = await getNodes();
      const cache = get().nodeLatencyByKey;
      const merged = freshAll.map((n) => ({
        ...n,
        delay: cache[nodeLatencyCacheKey(n.providerId, n.id)] ?? n.delay,
      }));

      let groupNow: string | undefined;
      if (get().isConnected) {
        try {
          const grp = await getGroupByName(AURESTREAM_NODE_SELECTOR);
          groupNow = grp?.now;
        } catch {
          /* 内核未就绪 */
        }
      }

      const cpId = currentProvider.id;
      const prev = get().currentNode;
      let next: Node | undefined;
      if (
        prev &&
        merged.some((n) => n.id === prev.id && n.providerId === cpId)
      ) {
        next = merged.find((n) => n.id === prev.id && n.providerId === cpId);
      } else if (
        groupNow &&
        merged.some((n) => n.name === groupNow && n.providerId === cpId)
      ) {
        next = merged.find((n) => n.name === groupNow && n.providerId === cpId);
      } else {
        next = merged.find((n) => n.providerId === cpId);
      }

      set({ nodes: merged, currentNode: next });

      if (next && get().isConnected && groupNow !== next.name) {
        try {
          await selectNodeForGroup(AURESTREAM_NODE_SELECTOR, next.name);
        } catch (e) {
          console.warn("selectNodeForGroup 同步失败:", e);
        }
      }
    } catch (e) {
      console.error("从数据库刷新节点失败:", e);
    }
  },

  setNodes: (nodes) => set({ nodes }),

  updateNodeDelay: (nodeId, delay) => {
    set((state) => {
      const nodes = state.nodes.map((n) =>
        n.id === nodeId ? { ...n, delay } : n,
      );
      const currentNode =
        state.currentNode?.id === nodeId
          ? { ...state.currentNode, delay }
          : state.currentNode;
      const cp = state.currentProvider;
      const nodeLatencyByKey = cp
        ? {
            ...state.nodeLatencyByKey,
            [nodeLatencyCacheKey(cp.id, nodeId)]: delay,
          }
        : state.nodeLatencyByKey;
      return { nodes, currentNode, nodeLatencyByKey };
    });
    savePersistedLatencyCache(get().nodeLatencyByKey).catch(console.error);
  },

  connect: async () => {
    const { currentProvider } = get();
    if (!currentProvider) throw new Error("请先选择一个订阅");
    if (get().isDisconnecting) throw new Error("正在断开连接，请稍候");

    set({ isConnecting: true });
    try {
      // 获取订阅配置文件路径
      const path = await getSubscriptionPath(currentProvider.id);
      if (!path) throw new Error("订阅配置文件不存在，请先更新订阅");

      const proxyBypassDomains = useAppStore.getState().proxyBypassDomains;
      const proxyConfig = await getProxyConfig();
      await updateProxyConfig({
        ...proxyConfig,
        bypass_domains: proxyBypassDomains,
      });
      await startProxy();

      // 对齐 external-controller、启动 Mihomo sidecar（内部轮询 API 就绪）
      const runtimePath = await buildRuntimeConfig(currentProvider.id);
      await startRuntimeEngine(runtimePath);

      // 刷新节点列表，若首次为空（provider 尚未加载），重试最多 5 次
      for (let i = 0; i < 5; i++) {
        await get().refreshSubscriptionNodesFromDb();
        if (get().nodes.length > 0) break;
        await new Promise((r) => setTimeout(r, 500));
      }

      stopMihomoTrafficPoll();
      startMihomoTrafficPoll(get);

      set({
        isConnecting: false,
        isConnected: true,
        connectedAt: Date.now(),
      });

      // 连接成功后，后台仅测试当前节点的延迟（不阻塞 UI、不持久化结果）
      const currentNode = get().currentNode;
      if (currentNode) {
        testNodeLatency(currentNode.id, currentNode.server, currentNode.port)
          .then((result) => {
            if (result.delay !== undefined) {
              set((state) => ({
                nodes: state.nodes.map((n) =>
                  n.id === currentNode.id ? { ...n, delay: result.delay, delayError: undefined } : n,
                ),
                currentNode:
                  state.currentNode?.id === currentNode.id
                    ? { ...state.currentNode, delay: result.delay, delayError: undefined }
                    : state.currentNode,
              }));
            } else {
              set((state) => ({
                nodes: state.nodes.map((n) =>
                  n.id === currentNode.id ? { ...n, delay: undefined, delayError: true } : n,
                ),
                currentNode:
                  state.currentNode?.id === currentNode.id
                    ? { ...state.currentNode, delay: undefined, delayError: true }
                    : state.currentNode,
              }));
            }
          })
          .catch((e) => {
            console.warn("连接后当前节点测速失败:", e);
            set((state) => ({
              nodes: state.nodes.map((n) =>
                n.id === currentNode.id ? { ...n, delay: undefined, delayError: true } : n,
              ),
              currentNode:
                state.currentNode?.id === currentNode.id
                  ? { ...state.currentNode, delay: undefined, delayError: true }
                  : state.currentNode,
            }));
          });
      }
    } catch (e) {
      stopMihomoTrafficPoll();
      try {
        await stopProxy();
      } catch {
        // ignore
      }
      logErrorDetail("proxy.connect", e);
      set({ isConnecting: false });
      throw e;
    }
  },

  disconnect: async () => {
    if (get().isDisconnecting) return;
    stopMihomoTrafficPoll();
    set({ isDisconnecting: true });
    try {
      try {
        const { closeAllConnections } = await import("tauri-plugin-mihomo-api");
        await closeAllConnections();
      } catch {
        // ignore cleanup errors
      }
      try {
        await stopProxy();
      } catch {
        // ignore
      }
      let dbNodes: Node[] = [];
      try {
        const n = await getNodes();
        if (Array.isArray(n)) dbNodes = n;
      } catch {
        /* 忽略：测试环境或未初始化 DB */
      }
      const prevNode = get().currentNode;
      const cp = get().currentProvider;
      const nextNode =
        prevNode &&
        cp &&
        dbNodes.some((x) => x.id === prevNode.id && x.providerId === cp.id)
          ? dbNodes.find((x) => x.id === prevNode.id)
          : undefined;
      set({
        isConnected: false,
        connectedAt: undefined,
        connectedIp: undefined,
        uploadSpeed: 0,
        downloadSpeed: 0,
        sessionUploadBytes: 0,
        sessionDownloadBytes: 0,
        nodes: dbNodes,
        currentNode: nextNode,
      });
    } finally {
      set({ isDisconnecting: false });
    }
  },

  setConnectStatus: (isConnected) => {
    if (!isConnected) stopMihomoTrafficPoll();
    set((s) => ({
      isConnected,
      connectedAt: isConnected ? (s.connectedAt ?? Date.now()) : undefined,
      connectedIp: isConnected ? s.connectedIp : undefined,
      ...(!isConnected
        ? {
            uploadSpeed: 0,
            downloadSpeed: 0,
            sessionUploadBytes: 0,
            sessionDownloadBytes: 0,
          }
        : {}),
    }));
  },

  setConnectingStatus: (isConnecting) => set({ isConnecting }),

  updateSpeeds: (upload, download) =>
    set({ uploadSpeed: upload, downloadSpeed: download }),

  applyMihomoTrafficTick: (upBps, downBps, sessionUpBytes, sessionDownBytes) =>
    set({
      uploadSpeed: upBps,
      downloadSpeed: downBps,
      sessionUploadBytes: sessionUpBytes,
      sessionDownloadBytes: sessionDownBytes,
    }),

  testLatency: async (skipPersist = false) => {
    const currentProvider0 = get().currentProvider;
    const nodes0 = get().nodes;
    const list0 = currentProvider0
      ? nodes0.filter((n) => n.providerId === currentProvider0.id && n.enabled)
      : [];
    if (!currentProvider0 || list0.length === 0) return;

    const cpId = currentProvider0.id;
    const listIds = new Set(list0.map((n) => n.id));
    set((state) => {
      const nextKey = { ...state.nodeLatencyByKey };
      for (const k of Object.keys(nextKey)) {
        if (!k.startsWith(`${cpId}:`)) continue;
        const nodePart = k.slice(cpId.length + 1);
        if (listIds.has(nodePart)) delete nextKey[k];
      }
      const nodes = state.nodes.map((n) =>
        listIds.has(n.id) && n.providerId === cpId
          ? { ...n, delay: undefined, delayError: undefined }
          : n,
      );
      let currentNode = state.currentNode;
      if (currentNode && listIds.has(currentNode.id)) {
        currentNode = { ...currentNode, delay: undefined, delayError: undefined };
      }
      const initialPending: Record<string, boolean> = {};
      for (const n of list0) initialPending[n.id] = true;
      return {
        isTestingLatency: true,
        latencyPendingByNodeId: initialPending,
        nodes,
        currentNode,
        nodeLatencyByKey: nextKey,
      };
    });

    try {

      // 获取当前订阅的节点列表
      const currentProvider = get().currentProvider;
      const nodes = get().nodes;
      const list = currentProvider
        ? nodes.filter((n) => n.providerId === currentProvider.id && n.enabled)
        : [];

      if (list.length === 0) return;

      // 分批次测试节点，每批最多 3 个并发
      const BATCH_SIZE = 3;
      for (let i = 0; i < list.length; i += BATCH_SIZE) {
        const batch = list.slice(i, i + BATCH_SIZE);

        set((state) => {
          const nextPending = { ...state.latencyPendingByNodeId };
          for (const node of batch) nextPending[node.id] = true;
          return { latencyPendingByNodeId: nextPending };
        });

        const results = await Promise.allSettled(
          batch.map((node) =>
            testNodeLatency(node.id, node.server, node.port),
          ),
        );

        for (let j = 0; j < batch.length; j++) {
          const node = batch[j];
          const settled = results[j];

          if (settled.status === "fulfilled") {
            const result = settled.value;
            const cp = get().currentProvider;
            set((state) => {
              const nextPending = { ...state.latencyPendingByNodeId };
              delete nextPending[node.id];
              if (result.delay === undefined) {
                return {
                  nodes: state.nodes.map((n) =>
                    n.id === node.id
                      ? { ...n, delay: undefined, delayError: true }
                      : n,
                  ),
                  latencyPendingByNodeId: nextPending,
                };
              }
              return {
                nodes: state.nodes.map((n) =>
                  n.id === node.id ? { ...n, delay: result.delay } : n,
                ),
                currentNode:
                  state.currentNode?.id === node.id
                    ? { ...state.currentNode, delay: result.delay }
                    : state.currentNode,
                nodeLatencyByKey: cp
                  ? {
                      ...state.nodeLatencyByKey,
                      [nodeLatencyCacheKey(cp.id, node.id)]:
                        result.delay as number,
                    }
                  : state.nodeLatencyByKey,
                latencyPendingByNodeId: nextPending,
              };
            });
          } else {
            console.warn(
              `Failed to test latency for node ${node.name}:`,
              settled.reason,
            );
            set((state) => {
              const nextPending = { ...state.latencyPendingByNodeId };
              delete nextPending[node.id];
              return {
                nodes: state.nodes.map((n) =>
                  n.id === node.id
                    ? { ...n, delay: undefined, delayError: true }
                    : n,
                ),
                latencyPendingByNodeId: nextPending,
              };
            });
          }
        }

        // 批次间短暂延迟
        if (i + BATCH_SIZE < list.length) {
          await new Promise((resolve) => setTimeout(resolve, 150));
        }
      }
    } catch (e) {
      console.error("Failed to start latency testing:", e);
    } finally {
      set({ isTestingLatency: false, latencyPendingByNodeId: {} });
      if (!skipPersist) {
        savePersistedLatencyCache(get().nodeLatencyByKey).catch(console.error);
      }
    }
  },

  fetchAndSaveSubscription: async (id: string) => {
    const provider = get().providers.find((p) => p.id === id);
    if (!provider) return { success: false, error: "服务商不存在" };

    const refreshingIds = new Set(get().refreshingIds);
    refreshingIds.add(id);
    set({ refreshingIds });

    try {
      await downloadSubscription(id, provider.url);
      const providers = await getProviders();
      let currentProvider = get().currentProvider;
      if (currentProvider?.id === id) {
        const fresh = providers.find((p) => p.id === id);
        if (fresh) currentProvider = fresh;
      }
      const sel = normalizeCurrentSubscriptionSelection(
        providers,
        currentProvider,
        get().currentNode,
      );
      set({ providers, ...sel });
      await get().refreshSubscriptionNodesFromDb();

      if (get().isConnected && get().currentProvider?.id === id) {
        try {
          const sp = await getSubscriptionPath(id);
          if (sp) {
            const runtimePath = await buildRuntimeConfig(id);
            await reloadConfig(true, runtimePath);
          }
        } catch (e) {
          console.error("订阅更新后 reload 内核失败:", e);
        }
      }

      return { success: true };
    } catch (e) {
      logErrorDetail("proxy.fetchAndSaveSubscription", e);
      return { success: false, error: userFacingMessage("subscription") };
    } finally {
      const ids = new Set(get().refreshingIds);
      ids.delete(id);
      set({ refreshingIds: ids });
    }
  },

  setCurrentSubscription: async (provider?: Provider) => {
    set({ currentProvider: provider, currentNode: undefined });
    if (!provider) return;

    try {
      const path = await getSubscriptionPath(provider.id);
      if (path && get().isConnected) {
        const runtimePath = await buildRuntimeConfig(provider.id);
        await reloadConfig(true, runtimePath);
      }
    } catch (e) {
      console.error("Failed to reload mihomo config:", e);
    }
    await get().refreshSubscriptionNodesFromDb();
  },

  initAutoUpdateTimers: () => {
    // 清除所有旧定时器
    for (const id of autoUpdateTimers.keys()) {
      clearAutoUpdateTimer(id);
    }
    // 为每个有 autoUpdateInterval 的 provider 设置定时器
    for (const provider of get().providers) {
      if (provider.autoUpdateInterval) {
        setupAutoUpdateTimer(
          provider.id,
          provider.autoUpdateInterval,
          get().fetchAndSaveSubscription,
        );
      }
    }
  },
}));

useProxyStore.subscribe((state, prevState) => {
  if (
    state.currentProvider?.id !== prevState.currentProvider?.id ||
    state.nodes !== prevState.nodes ||
    state.isConnected !== prevState.isConnected ||
    state.currentNode?.id !== prevState.currentNode?.id
  ) {
    const currentNodeId = state.currentNode?.id ?? null;
    if (!state.currentProvider) {
      updateTrayMenu([], state.isConnected, currentNodeId).catch(console.error);
      return;
    }
    const currentNodes = state.nodes.filter(
      (n) => n.providerId === state.currentProvider!.id && n.enabled,
    );
    updateTrayMenu(currentNodes, state.isConnected, currentNodeId).catch(console.error);
  }
});

// 持久化选择状态：provider / node / 连接状态
useProxyStore.subscribe((state, prevState) => {
  if (state.currentProvider?.id !== prevState.currentProvider?.id) {
    savePersistedState({ lastProviderId: state.currentProvider?.id }).catch(
      console.error,
    );
  }
  if (state.currentNode?.id !== prevState.currentNode?.id) {
    savePersistedState({ lastNodeId: state.currentNode?.id }).catch(
      console.error,
    );
  }
  if (state.isConnected !== prevState.isConnected) {
    savePersistedState({ wasConnected: state.isConnected }).catch(
      console.error,
    );
  }
});
