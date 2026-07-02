import { locale } from '@tauri-apps/plugin-os';
import { LazyStore } from '@tauri-apps/plugin-store';
import type { configType } from '@/config/common';
import { invalidateConnectionConfigCache } from '@/lib/merge-cache';
import { invalidateControllerClientCache } from '@/utils/singbox-api/controller-cache';
import {
    ALLOWLAN_STORE_KEY,
    CONTROLLER_PORT_STORE_KEY,
    CONTROLLER_SECRET_STORE_KEY,
    DEFAULT_CONTROLLER_PORT,
    DEFAULT_PROXY_PORT,
    ENABLE_BYPASS_ROUTER_STORE_KEY,
    ENABLE_TUN_STORE_KEY,
    LEGACY_CLASH_API_PORT_STORE_KEY,
    LEGACY_CLASH_API_SECRET_STORE_KEY,
    PROXY_BYPASS_STORE_KEY,
    PROXY_PORT_STORE_KEY,
    SKIP_SYSTEM_PROXY_STORE_KEY,
    TUN_STACK_STORE_KEY,
    USE_DHCP_STORE_KEY,
    USER_AGENT_STORE_KEY,
    AUTO_START_STORE_KEY,
    HIDE_ON_LAUNCH_STORE_KEY,
    MINIMIZE_TO_TRAY_STORE_KEY,
    AUTO_FAILOVER_ENABLED_KEY,
    LAST_MANUAL_NODE_TAG_KEY,
    SING_BOX_MAJOR_VERSION,
    SING_BOX_VERSION,
    SSI_STORE_KEY,
    SELECTED_NODE_TAG_STORE_PREFIX,
} from '../types/definition';

export const LANGUAGE_STORE_KEY = 'language';
const DIRECT_DNS_STORE_KEY = 'direct_dns';
const PROXY_DNS_STORE_KEY = 'proxy_dns';
const DEFAULT_DIRECT_DNS = '223.5.5.5';
const DEFAULT_PROXY_DNS = '8.8.8.8';

export const store = new LazyStore('settings.json', {
    defaults: {},
    autoSave: false,
});

const STORE_SAVE_DEBOUNCE_MS = 300;
const memoryCache = new Map<string, unknown>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saveInFlight: Promise<void> | null = null;

async function readStoreKey<T>(key: string): Promise<T | undefined> {
    if (memoryCache.has(key)) {
        return memoryCache.get(key) as T | undefined;
    }
    const value = await store.get(key);
    if (value !== undefined && value !== null) {
        memoryCache.set(key, value);
    }
    return value as T | undefined;
}

function writeStoreKey(key: string, value: unknown) {
    memoryCache.set(key, value);
}

export async function flushStore(): Promise<void> {
    if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
    }
    if (!saveInFlight) {
        saveInFlight = store.save().finally(() => {
            saveInFlight = null;
        });
    }
    await saveInFlight;
}

function scheduleStoreSave() {
    if (saveTimer) {
        clearTimeout(saveTimer);
    }
    saveTimer = setTimeout(() => {
        saveTimer = null;
        void flushStore();
    }, STORE_SAVE_DEBOUNCE_MS);
}

async function persistStoreKey(
    key: string,
    value: unknown,
    options?: { immediate?: boolean },
) {
    writeStoreKey(key, value);
    await store.set(key, value);
    if (options?.immediate) {
        await flushStore();
    } else {
        scheduleStoreSave();
    }
}

if (typeof window !== 'undefined') {
    window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            void flushStore();
        }
    });
}

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
    const value = await readStoreKey(key);
    if (defaultValue !== undefined && (value === undefined || value === null || value === '')) {
        return defaultValue;
    }
    return value;
}

export async function setStoreValue(
    key: string,
    value: any,
    options?: { immediate?: boolean },
) {
    await persistStoreKey(key, value, options);
}

export async function clearUserDataStore(): Promise<void> {
    // Clear user-specific keys from memory cache
    memoryCache.delete(SSI_STORE_KEY);
    for (const key of Array.from(memoryCache.keys())) {
        if (key.startsWith(SELECTED_NODE_TAG_STORE_PREFIX)) {
            memoryCache.delete(key);
        }
    }

    // Clear user-specific keys from LazyStore
    try {
        const keys = await store.keys();
        for (const key of keys) {
            if (key === SSI_STORE_KEY || key.startsWith(SELECTED_NODE_TAG_STORE_PREFIX)) {
                await store.delete(key);
            }
        }
        await flushStore();
    } catch (e) {
        console.error('Failed to clear user data from store:', e);
    }
}

export async function getEnableTun(): Promise<boolean> {
    return Boolean(await readStoreKey(ENABLE_TUN_STORE_KEY));
}

export async function setEnableTun(value: boolean) {
    await persistStoreKey(ENABLE_TUN_STORE_KEY, value);
    invalidateConnectionConfigCache();
}

export async function getAllowLan(): Promise<boolean> {
    return Boolean(await readStoreKey(ALLOWLAN_STORE_KEY));
}

export async function setAllowLan(value: boolean) {
    await persistStoreKey(ALLOWLAN_STORE_KEY, value);
    invalidateConnectionConfigCache();
}

async function readPortWithLegacy(
    primaryKey: string,
    legacyKey: string,
    defaultPort: number
): Promise<number> {
    const raw = (await readStoreKey(primaryKey)) ?? (await readStoreKey(legacyKey));
    const port = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isInteger(port) && port > 0 && port <= 65535) {
        if (!(await readStoreKey(primaryKey)) && (await readStoreKey(legacyKey))) {
            await persistStoreKey(primaryKey, port, { immediate: true });
        }
        return port;
    }
    return defaultPort;
}

/** Bearer secret for sing-box experimental.clash_api. */
export async function getControllerSecret(): Promise<string> {
    let secret =
        (await readStoreKey<string>(CONTROLLER_SECRET_STORE_KEY)) ??
        (await readStoreKey<string>(LEGACY_CLASH_API_SECRET_STORE_KEY));
    if (secret) {
        if (!(await readStoreKey(CONTROLLER_SECRET_STORE_KEY))) {
            await persistStoreKey(CONTROLLER_SECRET_STORE_KEY, secret, { immediate: true });
            invalidateControllerClientCache();
        }
        return secret;
    }
    const array = new Uint8Array(12);
    crypto.getRandomValues(array);
    const randomSecret = Array.from(array)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    await persistStoreKey(CONTROLLER_SECRET_STORE_KEY, randomSecret, { immediate: true });
    invalidateControllerClientCache();
    return randomSecret;
}

/** @deprecated Use getControllerSecret */
export const getClashApiSecret = getControllerSecret;

export async function isBypassRouterEnabled(): Promise<boolean> {
    return Boolean(await readStoreKey(ENABLE_BYPASS_ROUTER_STORE_KEY));
}

export async function setBypassRouterEnabled(value: boolean) {
    await persistStoreKey(ENABLE_BYPASS_ROUTER_STORE_KEY, value);
    invalidateConnectionConfigCache();
}

export async function getUseDHCP(): Promise<boolean> {
    const b = await readStoreKey(USE_DHCP_STORE_KEY);
    if (b === undefined) {
        return false;
    }
    return Boolean(b);
}

export async function setUseDHCP(value: boolean) {
    await persistStoreKey(USE_DHCP_STORE_KEY, value);
    invalidateConnectionConfigCache();
}

export async function getSkipSystemProxy(): Promise<boolean> {
    return Boolean(await readStoreKey(SKIP_SYSTEM_PROXY_STORE_KEY));
}

export async function setSkipSystemProxy(value: boolean) {
    await persistStoreKey(SKIP_SYSTEM_PROXY_STORE_KEY, value);
}

export async function setCustomRuleSet(key: 'direct' | 'proxy', config: { domain: string[]; domain_suffix: string[]; ip_cidr: string[] }) {
    await persistStoreKey(`custom_ruleset_${key}`, JSON.stringify(config), { immediate: true });
    invalidateConnectionConfigCache();
}

export async function getCustomRuleSet(key: 'direct' | 'proxy'): Promise<{ domain: string[]; domain_suffix: string[]; ip_cidr: string[] }> {
    let s = await readStoreKey<string>(`custom_ruleset_${key}`);
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
    await persistStoreKey(DIRECT_DNS_STORE_KEY, dnsServers);
    invalidateConnectionConfigCache();
}

export async function getConfiguredDirectDNS(): Promise<string | undefined> {
    const s = await readStoreKey<string>(DIRECT_DNS_STORE_KEY);
    const trimmed = s?.trim();
    return trimmed || undefined;
}

export async function getDirectDNS(): Promise<string> {
    return (await getConfiguredDirectDNS()) ?? DEFAULT_DIRECT_DNS;
}

/** Get the configured proxy DNS, falling back to the template default. */
export async function getProxyDnsServer(): Promise<string> {
    const s = await readStoreKey<string>(PROXY_DNS_STORE_KEY);
    const trimmed = s?.trim();
    return trimmed || DEFAULT_PROXY_DNS;
}

export async function getConfiguredProxyDNS(): Promise<string | undefined> {
    const s = await readStoreKey<string>(PROXY_DNS_STORE_KEY);
    const trimmed = s?.trim();
    return trimmed || undefined;
}

export async function getUserAgent(): Promise<string> {
    const ua = await readStoreKey<string>(USER_AGENT_STORE_KEY);
    return ua || 'default';
}

export async function setUserAgent(ua: string) {
    await persistStoreKey(USER_AGENT_STORE_KEY, ua);
}

export async function getProxyPort(): Promise<number> {
    const raw = await readStoreKey(PROXY_PORT_STORE_KEY);
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
    await persistStoreKey(PROXY_PORT_STORE_KEY, port, { immediate: true });
    invalidateConnectionConfigCache();
}

export async function getProxyBypass(): Promise<string> {
    const raw = await readStoreKey<string>(PROXY_BYPASS_STORE_KEY);
    return raw?.trim() ? raw : '';
}

export async function setProxyBypass(value: string): Promise<void> {
    await persistStoreKey(PROXY_BYPASS_STORE_KEY, value);
}

/** sing-box experimental.clash_api external_controller port */
export async function getControllerPort(): Promise<number> {
    return readPortWithLegacy(
        CONTROLLER_PORT_STORE_KEY,
        LEGACY_CLASH_API_PORT_STORE_KEY,
        DEFAULT_CONTROLLER_PORT
    );
}

export async function setControllerPort(port: number): Promise<void> {
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
        throw new Error('invalid_controller_port');
    }
    await persistStoreKey(CONTROLLER_PORT_STORE_KEY, port, { immediate: true });
    invalidateConnectionConfigCache();
    invalidateControllerClientCache();
}

/** @deprecated Use getControllerPort */
export const getClashApiPort = getControllerPort;
/** @deprecated Use setControllerPort */
export const setClashApiPort = setControllerPort;

export async function getConfigTemplateURLKey(mode: configType): Promise<string> {
    return `key-sing-box-${SING_BOX_MAJOR_VERSION}-${mode}-template-path`;
}

export async function getConfigTemplateURL(mode: configType): Promise<string> {
    const cacheKey = await getConfigTemplateURLKey(mode);
    const defaultTemplatePath = await getDefaultConfigTemplateURL(mode);
    let url = await getStoreValue(cacheKey, defaultTemplatePath) as string;
    if (url.includes('testingcf.jsdelivr.net') || url.includes('jsdelivr')) {
        url = defaultTemplatePath;
        await setStoreValue(cacheKey, url, { immediate: true });
    }
    return url;
}

export async function setConfigTemplateURL(mode: configType, url: string) {
    const cacheKey = await getConfigTemplateURLKey(mode);
    await setStoreValue(cacheKey, url, { immediate: true });
}

export async function getDefaultConfigTemplateURL(mode: configType): Promise<string> {
    const remoteUrl = "https://raw.githubusercontent.com/BadKid90s/AureStream-Config/main";
    const versionNumber = SING_BOX_VERSION.replace('v', '').split('.');
    const major = versionNumber[0];
    const minor = versionNumber[1];
    const patch = parseInt(versionNumber[2] || '0', 10);
    let ver = `${major}.${minor}`;
    if (major === '1' && minor === '13' && patch >= 8) {
        ver = '1.13';
    }

    switch (mode) {
        case 'mixed':
            return `${remoteUrl}/${ver}/zh-cn/mixed-rules.jsonc`;
        case 'tun':
            return `${remoteUrl}/${ver}/zh-cn/tun-rules.jsonc`;
        case 'mixed-global':
            return `${remoteUrl}/${ver}/zh-cn/mixed-global.jsonc`;
        case 'tun-global':
            return `${remoteUrl}/${ver}/zh-cn/tun-global.jsonc`;
    }
}

export type TunStack = 'system' | 'gvisor' | 'mixed';

export const DEFAULT_TUN_STACK: TunStack = 'gvisor';

const TUN_STACK_VALUES: TunStack[] = ['system', 'gvisor', 'mixed'];

export async function getTunStack(): Promise<TunStack> {
    const raw = await readStoreKey<string>(TUN_STACK_STORE_KEY);
    if (raw && TUN_STACK_VALUES.includes(raw as TunStack)) {
        return raw as TunStack;
    }
    return DEFAULT_TUN_STACK;
}

export async function setTunStack(value: TunStack): Promise<void> {
    if (!TUN_STACK_VALUES.includes(value)) {
        throw new Error('invalid_tun_stack');
    }
    await persistStoreKey(TUN_STACK_STORE_KEY, value);
    invalidateConnectionConfigCache();
}

export async function getAutoStart(): Promise<boolean> {
    const raw = await readStoreKey(AUTO_START_STORE_KEY);
    return raw === undefined ? true : Boolean(raw);
}

export async function setAutoStartStore(value: boolean): Promise<void> {
    await persistStoreKey(AUTO_START_STORE_KEY, value);
}

export async function getHideOnLaunch(): Promise<boolean> {
    const raw = await readStoreKey(HIDE_ON_LAUNCH_STORE_KEY);
    return raw === undefined ? false : Boolean(raw);
}

export async function setHideOnLaunchStore(value: boolean): Promise<void> {
    await persistStoreKey(HIDE_ON_LAUNCH_STORE_KEY, value);
}

export async function getMinimizeToTray(): Promise<boolean> {
    const raw = await readStoreKey(MINIMIZE_TO_TRAY_STORE_KEY);
    return raw === undefined ? true : Boolean(raw);
}

export async function setMinimizeToTrayStore(value: boolean): Promise<void> {
    await persistStoreKey(MINIMIZE_TO_TRAY_STORE_KEY, value);
}

export async function getAutoFailoverEnabled(): Promise<boolean> {
    const raw = await readStoreKey(AUTO_FAILOVER_ENABLED_KEY);
    return raw === undefined ? false : Boolean(raw);
}

export async function setAutoFailoverEnabled(value: boolean): Promise<void> {
    await persistStoreKey(AUTO_FAILOVER_ENABLED_KEY, value);
}

export async function getLastManualNodeTag(): Promise<string> {
    return (await readStoreKey<string>(LAST_MANUAL_NODE_TAG_KEY)) ?? "";
}

export async function setLastManualNodeTag(value: string): Promise<void> {
    await persistStoreKey(LAST_MANUAL_NODE_TAG_KEY, value);
}
