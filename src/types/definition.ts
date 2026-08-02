/** XTLS/Xray-core release tag (includes the "v" prefix, e.g. "v26.3.27"). */
export const XRAY_VERSION = "v26.3.27";

export const GITHUB_URL = 'https://github.com/BadKid90s/AureStream';
export const OFFICIAL_WEBSITE = 'https://xtls.github.io';
export const STAGE_VERSION_STORE_KEY = 'stage_version_key';
export const TUN_STACK_STORE_KEY = 'tun_stack_key';
export const TUN_INTERFACE_NAME = 'utun233';
export const USE_DHCP_STORE_KEY = 'use_dhcp_key';
export const SKIP_SYSTEM_PROXY_STORE_KEY = 'skip_system_proxy_key';
export const ENABLE_BYPASS_ROUTER_STORE_KEY = 'enable_bypass_router_key';
export const USER_AGENT_STORE_KEY = 'user_agent_key';
export const DEFAULT_PROXY_PORT = 2345;
export const PROXY_PORT_STORE_KEY = 'proxy_port_key';
export const AUTO_START_STORE_KEY = 'auto_start_key';
export const HIDE_ON_LAUNCH_STORE_KEY = 'hide_on_launch_key';
export const MINIMIZE_TO_TRAY_STORE_KEY = 'minimize_to_tray_key';

/** Xray-core `api` inbound (gRPC HandlerService/StatsService/RoutingService) port. */
export const DEFAULT_CONTROLLER_PORT = 9191;
export const CONTROLLER_PORT_STORE_KEY = 'core_api_port_key';
/** Legacy store key (read-only migration) */
export const LEGACY_CLASH_API_PORT_STORE_KEY = 'clash_api_port_key';

export const APP_VERSION = '0.3.4';

export function buildSubscriptionUserAgent(): string {
    return `sing-box`;
}
export const ALLOWLAN_STORE_KEY = 'allow_lan_key';
export const ENABLE_TUN_STORE_KEY = 'enable_tun_key';
export const SSI_STORE_KEY = "selected_subscription_identifier";
/** Per-subscription remembered proxy node tag (append identifier). */
export const SELECTED_NODE_TAG_STORE_PREFIX = "selected_node_tag:";
/** @deprecated Legacy global key; migrated on read when per-sub key is empty. */
export const LEGACY_SELECTED_NODE_TAG_KEY = "selected_node_tag";
export const AUTO_UPDATE_STORE_KEY = "auto_update_key";
export const UPDATE_INTERVAL_STORE_KEY = "update_interval_key";
export const AUTO_FAILOVER_ENABLED_KEY = "auto_failover_key";
export const LAST_MANUAL_NODE_TAG_KEY = "last_manual_node_tag";
export type UpdateInterval = "30m" | "1h" | "2h" | "3h" | "6h" | "12h" | "24h" | "7d";
export const INTERVAL_SECONDS: Record<UpdateInterval, number> = {
  "30m": 30 * 60,
  "1h": 3600,
  "2h": 2 * 3600,
  "3h": 3 * 3600,
  "6h": 6 * 3600,
  "12h": 12 * 3600,
  "24h": 24 * 3600,
  "7d": 7 * 24 * 3600,
};

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
