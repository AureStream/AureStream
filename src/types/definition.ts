
export const SING_BOX_MAJOR_VERSION = "1.13";
export const SING_BOX_MINOR_VERSION = "12";
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
export const DEFAULT_PROXY_PORT = 6789;
export const PROXY_PORT_STORE_KEY = 'proxy_port_key';
export const ALLOWLAN_STORE_KEY = 'allow_lan_key';
export const ENABLE_TUN_STORE_KEY = 'enable_tun_key';

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
