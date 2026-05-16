/**
 * 基于 tauri-plugin-store 的持久化层
 *
 * 后端主配置使用 `aurestream.yaml`，与用户侧轻量持久化拆分：以下为 3 个独立的 JSON store：
 * - settings.json:   轻量 UI 设置（theme, autoConnect 等）
 * - state.json:      运行状态恢复（上次选中的 provider/node、是否已连接）
 * - latency-cache.json: 延迟测速缓存（频繁写入，独立隔离）
 *
 * providers 数据继续由后端 `aurestream.yaml` 管理（通过 IPC 读写）。
 */

import { Store } from "@tauri-apps/plugin-store";

// ---- Store 实例（惰性加载、全局单例）----

let _settingsStore: Store | null = null;
let _stateStore: Store | null = null;
let _latencyCacheStore: Store | null = null;

async function getSettingsStore(): Promise<Store> {
  if (!_settingsStore) {
    _settingsStore = await Store.load("settings.json");
  }
  return _settingsStore;
}

async function getStateStore(): Promise<Store> {
  if (!_stateStore) {
    _stateStore = await Store.load("state.json");
  }
  return _stateStore;
}

async function getLatencyCacheStore(): Promise<Store> {
  if (!_latencyCacheStore) {
    _latencyCacheStore = await Store.load("latency-cache.json");
  }
  return _latencyCacheStore;
}

// ---- Settings ----

export interface PersistedSettings {
  theme: "light" | "dark" | "system";
  proxyBypassDomains: string;
  autoStart: boolean;
  autoConnect: boolean;
}

const DEFAULT_SETTINGS: PersistedSettings = {
  theme: "light",
  proxyBypassDomains: "",
  autoStart: false,
  autoConnect: false,
};

export async function loadPersistedSettings(): Promise<PersistedSettings> {
  const store = await getSettingsStore();
  const theme = (await store.get<string>("theme")) ?? DEFAULT_SETTINGS.theme;
  const proxyBypassDomains =
    (await store.get<string>("proxyBypassDomains")) ??
    DEFAULT_SETTINGS.proxyBypassDomains;
  const autoStart =
    (await store.get<boolean>("autoStart")) ?? DEFAULT_SETTINGS.autoStart;
  const autoConnect =
    (await store.get<boolean>("autoConnect")) ?? DEFAULT_SETTINGS.autoConnect;
  return {
    theme: theme as "light" | "dark",
    proxyBypassDomains,
    autoStart,
    autoConnect,
  };
}

export async function savePersistedSettings(
  settings: Partial<PersistedSettings>,
): Promise<void> {
  const store = await getSettingsStore();
  for (const [key, value] of Object.entries(settings)) {
    await store.set(key, value);
  }
}

// ---- Last State (for restore & auto-connect) ----

export interface PersistedState {
  lastProviderId?: string;
  lastNodeId?: string;
  wasConnected?: boolean;
}

export async function loadPersistedState(): Promise<PersistedState> {
  const store = await getStateStore();
  return {
    lastProviderId: (await store.get<string>("lastProviderId")) ?? undefined,
    lastNodeId: (await store.get<string>("lastNodeId")) ?? undefined,
    wasConnected: (await store.get<boolean>("wasConnected")) ?? false,
  };
}

export async function savePersistedState(
  state: Partial<PersistedState>,
): Promise<void> {
  const store = await getStateStore();
  for (const [key, value] of Object.entries(state)) {
    await store.set(key, value ?? null);
  }
}

// ---- Latency Cache ----

export async function loadPersistedLatencyCache(): Promise<
  Record<string, number>
> {
  const store = await getLatencyCacheStore();
  const cache = await store.get<Record<string, number>>("cache");
  return cache ?? {};
}

export async function savePersistedLatencyCache(
  cache: Record<string, number>,
): Promise<void> {
  const store = await getLatencyCacheStore();
  await store.set("cache", cache);
  await store.save(); // 手动 save，因为 autoSave 已关闭（防抖）
}
