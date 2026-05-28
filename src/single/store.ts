import { invoke } from '@tauri-apps/api/core';
import { locale } from '@tauri-apps/plugin-os';
import { LazyStore } from '@tauri-apps/plugin-store';
import { ALLOWLAN_STORE_KEY, DEFAULT_PROXY_PORT, ENABLE_BYPASS_ROUTER_STORE_KEY, ENABLE_TUN_STORE_KEY, PROXY_PORT_STORE_KEY, SKIP_SYSTEM_PROXY_STORE_KEY, USE_DHCP_STORE_KEY, USER_AGENT_STORE_KEY } from '../types/definition';

export const LANGUAGE_STORE_KEY = 'language';
export const CLASH_API_SECRET = 'clash_api_secret_key';

export const store = new LazyStore('settings.json', {
    defaults: {},
    autoSave: true
});

export const getLanguage = async () => {
    const language = await getStoreValue(LANGUAGE_STORE_KEY) as string | undefined;
    if (language) {
        return language;
    }
    const osLocale = await locale();
    if (osLocale) {
        if (osLocale.startsWith('zh')) {
            return 'zh';
        } else {
            return 'en';
        }
    }
    return 'en';
};

export const setLanguage = async (language: string) => {
    await setStoreValue(LANGUAGE_STORE_KEY, language);
};

export async function getStoreValue(key: string, defaultValue?: any): Promise<any> {
    let value = await store.get(key);
    if (defaultValue && (value === undefined || value === null || value === '')) {
        return defaultValue;
    }
    return value;
}

export async function setStoreValue(key: string, value: any) {
    await store.set(key, value);
    await store.save();
}

export async function getEnableTun(): Promise<boolean> {
    let b = await store.get(ENABLE_TUN_STORE_KEY);
    return Boolean(b);
}

export async function setEnableTun(value: boolean) {
    await store.set(ENABLE_TUN_STORE_KEY, value);
    await store.save();
}

export async function getAllowLan(): Promise<boolean> {
    let b = await store.get(ALLOWLAN_STORE_KEY);
    return Boolean(b);
}

export async function setAllowLan(value: boolean) {
    await store.set(ALLOWLAN_STORE_KEY, value);
    await store.save();
}

export async function getClashApiSecret(): Promise<string> {
    const secret = await store.get(CLASH_API_SECRET);
    if (secret) {
        return secret as string;
    } else {
        const array = new Uint8Array(12);
        crypto.getRandomValues(array);
        const randomSecret = Array.from(array)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
        await store.set(CLASH_API_SECRET, randomSecret);
        await store.save();
        return randomSecret;
    }
}

export async function isBypassRouterEnabled(): Promise<boolean> {
    let b = await store.get(ENABLE_BYPASS_ROUTER_STORE_KEY);
    return Boolean(b);
}

export async function setBypassRouterEnabled(value: boolean) {
    await store.set(ENABLE_BYPASS_ROUTER_STORE_KEY, value);
    await store.save();
}

export async function getUseDHCP(): Promise<boolean> {
    let b = await store.get(USE_DHCP_STORE_KEY);
    if (b === undefined) {
        return false;
    }
    return Boolean(b);
}

export async function setUseDHCP(value: boolean) {
    await store.set(USE_DHCP_STORE_KEY, value);
    await store.save();
}

export async function getSkipSystemProxy(): Promise<boolean> {
    let b = await store.get(SKIP_SYSTEM_PROXY_STORE_KEY);
    return Boolean(b);
}

export async function setSkipSystemProxy(value: boolean) {
    await store.set(SKIP_SYSTEM_PROXY_STORE_KEY, value);
    await store.save();
}

export async function setCustomRuleSet(key: 'direct' | 'proxy', config: { domain: string[]; domain_suffix: string[]; ip_cidr: string[] }) {
    await store.set(`custom_ruleset_${key}`, JSON.stringify(config));
    await store.save();
}

export async function getCustomRuleSet(key: 'direct' | 'proxy'): Promise<{ domain: string[]; domain_suffix: string[]; ip_cidr: string[] }> {
    let s = await store.get(`custom_ruleset_${key}`) as string | undefined;
    if (s) {
        try {
            const config = JSON.parse(s);
            if (config && typeof config === 'object') {
                if (!Array.isArray(config.domain)) config.domain = [];
                if (!Array.isArray(config.domain_suffix)) config.domain_suffix = [];
                if (!Array.isArray(config.ip_cidr)) config.ip_cidr = [];
                return config;
            }
        } catch (e) {
            console.error('解析自定义规则集失败:', e);
        }
    }
    return { domain: [], domain_suffix: [], ip_cidr: [] };
}

export async function setDirectDNS(dnsServers: string) {
    await store.set('direct_dns', dnsServers);
    await store.save();
}

export async function getDirectDNS(): Promise<string> {
    let s = await store.get('direct_dns') as string | undefined;
    if (s) {
        return s;
    }
    try {
        let defaultValue = await invoke('get_optimal_local_dns_server') as string;
        return defaultValue || '223.5.5.5';
    } catch {
        return '223.5.5.5';
    }
}

export async function getUserAgent(): Promise<string> {
    const ua = await store.get(USER_AGENT_STORE_KEY) as string | undefined;
    return ua || 'default';
}

export async function setUserAgent(ua: string) {
    await store.set(USER_AGENT_STORE_KEY, ua);
    await store.save();
}

export async function getProxyPort(): Promise<number> {
    const raw = await store.get(PROXY_PORT_STORE_KEY);
    const port = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isInteger(port) && port > 0 && port <= 65535) {
        return port;
    }
    return DEFAULT_PROXY_PORT;
}

export async function setProxyPort(port: number): Promise<void> {
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
        throw new Error('invalid_proxy_port');
    }
    await store.set(PROXY_PORT_STORE_KEY, port);
    await store.save();
}
