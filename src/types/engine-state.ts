export type EngineState =
  | { kind: "idle"; epoch: number }
  | { kind: "starting"; since: number; epoch: number; mode: string }
  | { kind: "running"; since: number; epoch: number; mode: string }
  | { kind: "stopping"; since: number; epoch: number }
  | { kind: "switching"; since: number; epoch: number; from_mode: string; to_mode: string }
  | { kind: "failed"; reason: string; at: number; epoch: number }

export interface ProxyNode {
  id: string
  name: string
  host: string
  port: number
  latencyLabel: string
}

export interface TrafficPoint {
  time: string
  download: number
  upload: number
}

export interface IpInfo {
  ip: string
  country: string
  city: string
  isp: string
  asn: string
}
