export interface Provider {
  id: string;
  name: string;
  url: string;
  lastUpdated: string;
  nodeCount: number;
  /** 订阅总流量（GB），可选；用于首页展示 */
  trafficTotalGB?: number;
  /** 已用流量（GB），可选 */
  trafficUsedGB?: number;
  /** 订阅到期时间 ISO 8601 */
  expiresAt?: string;
  /** 自动更新间隔（分钟），undefined 表示不自动更新 */
  autoUpdateInterval?: number;
}

export interface Node {
  id: string;
  name: string;
  providerId: string;
  type: string;
  server: string;
  port: number;
  delay?: number;
  /** 测速失败（如连接超时） */
  delayError?: boolean;
  enabled: boolean;
}

export interface ProxyStatus {
  isConnected: boolean;
  currentNode?: Node;
  uploadSpeed: number;
  downloadSpeed: number;
  latency?: number;
}

export interface AppConfig {
  theme: "light" | "dark";
  providers: Provider[];
  nodes: Node[];
  proxy: {
    bypassDomains: string;
  };
  startup: {
    autoStart: boolean;
    autoConnect: boolean;
  };
}

export type LatencyLevel = "excellent" | "good" | "poor" | "unknown";

export function getLatencyLevel(delay?: number): LatencyLevel {
  if (delay === undefined) return "unknown";
  if (delay < 100) return "excellent";
  if (delay < 300) return "good";
  return "poor";
}

export function getLatencyColor(delay?: number): string {
  const level = getLatencyLevel(delay);
  switch (level) {
    case "excellent":
      return "text-primary";
    case "good":
      return "text-yellow-500";
    case "poor":
      return "text-red-500";
    default:
      return "text-gray-400";
  }
}
