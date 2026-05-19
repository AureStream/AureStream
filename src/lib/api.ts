import { invoke } from "@tauri-apps/api/core";
import type { Provider, Node } from "@/types";

/** Tauri invoke 常见 rejection 为字符串；统一成可读文案供 Toast 展示 */
export function formatInvokeError(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  if (
    e &&
    typeof e === "object" &&
    "message" in e &&
    typeof (e as { message: unknown }).message === "string"
  ) {
    return (e as { message: string }).message;
  }
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

export interface ProxyConfig {
  listen: string;
  mixed_port: number;
  bypass_domains: string;
}

export interface ProxyStatus {
  is_running: boolean;
  current_node?: string;
  upload_bytes: number;
  download_bytes: number;
}

export interface LatencyResult {
  node_id: string;
  delay?: number;
  error?: string;
}

export async function startProxy(): Promise<string> {
  return await invoke<string>("start_proxy");
}

export async function stopProxy(): Promise<string> {
  return await invoke<string>("stop_proxy");
}

export async function getProxyStatus(): Promise<ProxyStatus> {
  return await invoke<ProxyStatus>("get_proxy_status");
}

export async function setCurrentNode(nodeName: string): Promise<void> {
  return await invoke<void>("set_current_node", { nodeName });
}

export async function updateProxyConfig(config: ProxyConfig): Promise<void> {
  return await invoke<void>("update_proxy_config", { config });
}

export async function getProxyConfig(): Promise<ProxyConfig> {
  return await invoke<ProxyConfig>("get_proxy_config");
}

export async function addProvider(provider: Provider): Promise<void> {
  return await invoke<void>("add_provider", { provider });
}

export async function updateProvider(
  id: string,
  updates: Provider,
): Promise<void> {
  return await invoke<void>("update_provider", { id, updates });
}

export async function deleteProvider(id: string): Promise<void> {
  return await invoke<void>("delete_provider", { id });
}

export async function getProviders(): Promise<Provider[]> {
  return await invoke<Provider[]>("get_providers");
}

export async function updateTrayMenu(
  nodes: Node[],
  isConnected: boolean,
  currentNodeId: string | null,
): Promise<void> {
  return await invoke<void>("update_tray_menu", { nodes, isConnected, currentNodeId });
}

export async function getNodes(): Promise<Node[]> {
  return await invoke<Node[]>("get_nodes");
}

export async function getNodesByProvider(providerId: string): Promise<Node[]> {
  return await invoke<Node[]>("get_nodes_by_provider", { providerId });
}

export async function fetchSubscription(url: string): Promise<string> {
  return await invoke<string>("fetch_subscription", { url });
}

export async function testNodeLatency(
  nodeId: string,
  server: string,
  port: number,
): Promise<LatencyResult> {
  return await invoke<LatencyResult>("test_node_latency", {
    nodeId,
    server,
    port,
  });
}

export async function testAllNodesLatency(): Promise<LatencyResult[]> {
  return await invoke<LatencyResult[]>("test_all_nodes_latency");
}

// --- Subscription management ---

export interface SubscriptionMeta {
  upload_bytes?: number;
  download_bytes?: number;
  total_bytes?: number;
  expire_timestamp?: number;
}

export interface DownloadResult {
  path: string;
  contentLength: number;
  meta?: SubscriptionMeta;
  debugHeaders?: [string, string][];
}

export async function downloadSubscription(
  providerId: string,
  url: string,
): Promise<DownloadResult> {
  return await invoke<DownloadResult>("download_subscription", {
    providerId,
    url,
  });
}

export async function getSubscriptionPath(
  providerId: string,
): Promise<string | null> {
  return await invoke<string | null>("get_subscription_path", { providerId });
}

export async function deleteSubscriptionFile(
  providerId: string,
): Promise<void> {
  return await invoke<void>("delete_subscription_file", { providerId });
}

export async function buildRuntimeConfig(providerId: string): Promise<string> {
  return await invoke<string>("build_runtime_config", { providerId });
}

/** 启动或重启本地代理内核侧进程（使用 buildRuntimeConfig 生成的配置绝对路径） */
export async function startRuntimeEngine(
  runtimeConfigPath: string,
): Promise<void> {
  return await invoke<void>("start_runtime_engine", { runtimeConfigPath });
}

/** 结束由应用拉起的本地代理内核进程 */
export async function stopRuntimeEngine(): Promise<void> {
  return await invoke<void>("stop_runtime_engine");
}

// --- App settings & latency cache ---

export interface AppSettings {
  theme: "light" | "dark";
  proxyBypassDomains: string;
  autoStart: boolean;
  autoConnect: boolean;
}

export async function loadAppSettings(): Promise<AppSettings> {
  return await invoke<AppSettings>("load_app_settings");
}

export async function saveAppSettings(settings: AppSettings): Promise<void> {
  return await invoke<void>("save_app_settings", { settings });
}

export async function loadLatencyCache(): Promise<Record<string, number>> {
  return await invoke<Record<string, number>>("load_latency_cache");
}

export async function saveLatencyCache(
  cache: Record<string, number>,
): Promise<void> {
  return await invoke<void>("save_latency_cache", { cache });
}
