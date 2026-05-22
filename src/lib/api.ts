import { invoke } from "@tauri-apps/api/core";
import type { Provider, Node } from "@/types";

export interface ProxyConfig {
  listen: string;
  mixed_port: number;
  bypass_domains: string;
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

// --- Subscription management ---

export interface DownloadResult {
  path: string;
  contentLength: number;
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

// --- Network info ---

export interface NetworkInfo {
  ip: string;
  city: string;
  region: string;
  country: string;
  asn: string;
  org: string;
  fetchMode: string;
}

export async function getNetworkInfo(): Promise<NetworkInfo> {
  return await invoke<NetworkInfo>("get_network_info");
}
