/**
 * sing-box experimental.clash_api REST surface (Clash Meta compatible).
 * @see https://sing-box.sagernet.org/configuration/experimental/clash-api/
 */

export interface SingBoxProxyItem {
  name: string
  type: string
  udp: boolean
  history: Array<{ time: string; delay: number }>
  delay?: number
}

export interface SingBoxProxyGroup {
  name: string
  type: string
  all: string[]
  now: string
}

export interface SingBoxTrafficTick {
  up: number
  down: number
}
