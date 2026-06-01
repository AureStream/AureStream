export type ProxyNode = {
  id: string
  name: string
  host: string
  port: number
  latencyLabel: string
}

export const proxyNodes: ProxyNode[] = [
  {
    id: "1",
    name: "【测速 Nodes】37.68MB/s | 162.159.42.221",
    host: "162.159.42.221",
    port: 443,
    latencyLabel: "未测速",
  },
  {
    id: "2",
    name: "【测速 Nodes】37.68MB/s | 162.159.42.222",
    host: "162.159.42.222",
    port: 443,
    latencyLabel: "未测速",
  },
  {
    id: "3",
    name: "【测速 Nodes】37.68MB/s | 162.159.42.223",
    host: "162.159.42.223",
    port: 443,
    latencyLabel: "未测速",
  },
]

export const trafficHistory = Array.from({ length: 24 }, (_, i) => ({
  time: `${i}:00`,
  download: 0,
  upload: 0,
}))
