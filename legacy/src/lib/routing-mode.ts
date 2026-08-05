export const ROUTING_MODE_KEY = "routing_mode"

export type RoutingMode = "rule" | "global"

const LABELS: Record<RoutingMode, string> = {
  rule: "规则分流",
  global: "全局代理",
}

/** Home page only supports rule / global; legacy `direct` maps to rule. */
export function normalizeRoutingMode(raw: unknown): RoutingMode {
  if (raw === "global") return "global"
  return "rule"
}

export function nextRoutingMode(current: RoutingMode): RoutingMode {
  return current === "rule" ? "global" : "rule"
}

export function routingModeLabel(mode: RoutingMode): string {
  return LABELS[mode]
}

export function isGlobalRouting(mode: RoutingMode): boolean {
  return mode === "global"
}
