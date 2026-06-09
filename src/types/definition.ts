
export const SING_BOX_MAJOR_VERSION = "1.13";
export const SING_BOX_MINOR_VERSION = "13";
export const SING_BOX_VERSION = `v${SING_BOX_MAJOR_VERSION}.${SING_BOX_MINOR_VERSION}`;

export const GITHUB_URL = 'https://github.com/BadKid90s/AureStream';
export const OFFICIAL_WEBSITE = 'https://sing-box.net';
export const STAGE_VERSION_STORE_KEY = 'stage_version_key';
export const TUN_STACK_STORE_KEY = 'tun_stack_key';
export const TUN_INTERFACE_NAME = 'utun233';
export const USE_DHCP_STORE_KEY = 'use_dhcp_key';
export const SKIP_SYSTEM_PROXY_STORE_KEY = 'skip_system_proxy_key';
export const ENABLE_BYPASS_ROUTER_STORE_KEY = 'enable_bypass_router_key';
export const USER_AGENT_STORE_KEY = 'user_agent_key';
export const DEFAULT_PROXY_PORT = 2345;
export const PROXY_PORT_STORE_KEY = 'proxy_port_key';
export const PROXY_BYPASS_STORE_KEY = 'proxy_bypass_key';
export const AUTO_START_STORE_KEY = 'auto_start_key';
export const HIDE_ON_LAUNCH_STORE_KEY = 'hide_on_launch_key';
export const MINIMIZE_TO_TRAY_STORE_KEY = 'minimize_to_tray_key';

/** sing-box experimental.clash_api external_controller port */
export const DEFAULT_CONTROLLER_PORT = 9191;
export const CONTROLLER_PORT_STORE_KEY = 'singbox_api_port_key';
export const CONTROLLER_SECRET_STORE_KEY = 'singbox_api_secret_key';
/** Legacy store keys (read-only migration) */
export const LEGACY_CLASH_API_PORT_STORE_KEY = 'clash_api_port_key';
export const LEGACY_CLASH_API_SECRET_STORE_KEY = 'clash_api_secret_key';

export const APP_VERSION = '0.2.5';

export function buildSubscriptionUserAgent(): string {
    return `AureStream/${APP_VERSION} (sing-box/${SING_BOX_MAJOR_VERSION}.${SING_BOX_MINOR_VERSION})`;
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
