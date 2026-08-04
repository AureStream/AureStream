/** XTLS/Xray-core release tag (includes the "v" prefix, e.g. "v26.3.27"). */
export const XRAY_VERSION = "v26.3.27";

export const GITHUB_URL = 'https://github.com/BadKid90s/AureStream';
export const TUN_INTERFACE_NAME = 'utun233';
export const ENABLE_BYPASS_ROUTER_STORE_KEY = 'enable_bypass_router_key';
export const DEFAULT_PROXY_PORT = 2345;
export const PROXY_PORT_STORE_KEY = 'proxy_port_key';
export const AUTO_START_STORE_KEY = 'auto_start_key';
export const HIDE_ON_LAUNCH_STORE_KEY = 'hide_on_launch_key';
export const MINIMIZE_TO_TRAY_STORE_KEY = 'minimize_to_tray_key';

/** Xray-core `api` inbound (gRPC HandlerService/StatsService/RoutingService) port. */
export const DEFAULT_CONTROLLER_PORT = 9191;
export const CONTROLLER_PORT_STORE_KEY = 'core_api_port_key';
/** Legacy store key (read-only migration from Clash-API era). */
export const LEGACY_CLASH_API_PORT_STORE_KEY = 'clash_api_port_key';

export function buildSubscriptionUserAgent(): string {
    return `AureStream/${XRAY_VERSION}`;
}
export const ALLOWLAN_STORE_KEY = 'allow_lan_key';
export const ENABLE_TUN_STORE_KEY = 'enable_tun_key';
export const SSI_STORE_KEY = "selected_subscription_identifier";
/** Per-subscription remembered proxy node tag (append identifier). */
export const SELECTED_NODE_TAG_STORE_PREFIX = "selected_node_tag:";
export const AUTO_FAILOVER_ENABLED_KEY = "auto_failover_key";
export const LAST_MANUAL_NODE_TAG_KEY = "last_manual_node_tag";

export function selectedNodeTagStoreKey(identifier: string): string {
  return `${SELECTED_NODE_TAG_STORE_PREFIX}${identifier}`;
}

export interface Subscription {
  id: number;
  identifier: string;
  name: string;
  used_traffic: number;
  total_traffic: number;
  subscription_url: string;
  official_website: string;
  expire_time: number;
  last_update_time: number;
}

export interface SubscriptionConfig {
  id: number;
  identifier: string;
  config_content: string;
}
