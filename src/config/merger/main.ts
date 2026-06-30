import * as path from '@tauri-apps/api/path';
import { type as getOsType } from '@tauri-apps/plugin-os';
import { getSubscriptionConfig, getSubscriptionMergeRevision } from '../../action/db';
import {
    getAllowLan,
    getConfiguredDirectDNS,
    getConfiguredProxyDNS,
    getControllerSecret,
    getControllerPort,
    getCustomRuleSet,
    getProxyPort,
    getStoreValue,
    getTunStack,
    getUseDHCP,
    isBypassRouterEnabled,
    setStoreValue,
} from '../../single/store';
import { DIRECT_RULE_SLOT, LEGACY_DIRECT_RULE_SLOT, LEGACY_PROXY_RULE_SLOT, PROXY_RULE_SLOT, ruleSlotMatches } from '../rule-tags';
import { STAGE_VERSION_STORE_KEY, selectedNodeTagStoreKey, LEGACY_SELECTED_NODE_TAG_KEY } from '../../types/definition';
import { configureMixedInbound, configureTunInbound, updateDHCPSettings2Config, updateVPNServerConfigFromDB, patchDnsProxyConfig } from './helper';

import { configType, getConfigTemplateCacheKey } from '../common';
import { cacheFileNameForProfile } from '../rule-cache';
import { getBuiltInTemplate } from '../templates';

const templateStringCache = new Map<string, string>();
const templateObjectCache = new Map<string, object>();

async function getConfigTemplate(mode: configType): Promise<any> {
    const cacheKey = await getConfigTemplateCacheKey(mode);
    const cachedObject = templateObjectCache.get(cacheKey);
    if (cachedObject) {
        return structuredClone(cachedObject);
    }

    let config = templateStringCache.get(cacheKey);
    if (!config) {
        config = await getStoreValue(cacheKey, '');
        if (!config) {
            config = getBuiltInTemplate(mode);
            await setStoreValue(cacheKey, config);
            console.info(`[template] cache empty for mode=${mode}, seeded built-in snapshot`);
        }
        templateStringCache.set(cacheKey, config);
    }

    let parsed: any;
    try {
      parsed = JSON.parse(config);
    } catch (e) {
      console.error(`[template] corrupt config for mode=${mode}, clearing cache:`, e);
      config = getBuiltInTemplate(mode);
      templateStringCache.set(cacheKey, config);
      parsed = JSON.parse(config);
      await setStoreValue(cacheKey, config);
    }

    templateObjectCache.set(cacheKey, parsed);
    return structuredClone(parsed);
}

export function clearTemplateResolvedCache() {
    templateObjectCache.clear();
}

async function updateExperimentalConfig(newConfig: any, dbCacheFilePath: string) {
    newConfig.experimental.cache_file = {
        enabled: true,
        path: dbCacheFilePath,
        store_fakeip: true,
        store_rdrc: true,
    };

    newConfig.experimental.clash_api.external_controller =
        `127.0.0.1:${await getControllerPort()}`;
    const secret = await getControllerSecret();
    if (secret) {
        newConfig.experimental.clash_api.secret = secret;
    }
}

async function getSavedDefaultNode(identifier: string): Promise<string> {
    if (!identifier) return '';
    const key = selectedNodeTagStoreKey(identifier);
    const [saved, legacy] = await Promise.all([
        getStoreValue(key, '') as Promise<string>,
        getStoreValue(LEGACY_SELECTED_NODE_TAG_KEY, '') as Promise<string>,
    ]);
    return saved || legacy || '';
}

type CustomRuleSet = {
    domain: string[];
    domain_suffix: string[];
    ip_cidr: string[];
}

/** Routing mode dimension (without proxy mode). */
export type RoutingMode = 'rule' | 'global';

/** Merge profile: encodes both routing mode and proxy mode. */
export type MergeProfile = {
    mode: configType;
    customRules: boolean;
}

/** Convenience: build MergeProfile from routing mode + TUN boolean. */
export function makeProfile(routing: RoutingMode, tun: boolean): MergeProfile {
    if (routing === 'global') {
        return { mode: tun ? 'tun-global' : 'mixed-global', customRules: false };
    }
    return { mode: tun ? 'tun' : 'mixed', customRules: true };
}

type MergeConfigOptions = MergeProfile & {
    label: string;
}

/** Fingerprint of all inputs that affect generated config.json (for merge skip cache). */
export async function computeMergeCacheKey(
    identifier: string,
    profile: MergeProfile,
): Promise<string> {
    const customRulePromises = profile.customRules
        ? [getCustomRuleSet('direct'), getCustomRuleSet('proxy')] as const
        : [Promise.resolve(null), Promise.resolve(null)] as const;

    const [
        subRev,
        templateKey,
        stageVersion,
        allowLan,
        bypassRouter,
        proxyPort,
        tunStack,
        useDHCP,
        directDNS,
        proxyDNS,
        controllerPort,
        controllerSecret,
        defaultNode,
        directRules,
        proxyRules,
    ] = await Promise.all([
        getSubscriptionMergeRevision(identifier),
        getConfigTemplateCacheKey(profile.mode),
        getStoreValue(STAGE_VERSION_STORE_KEY),
        getAllowLan(),
        isBypassRouterEnabled(),
        getProxyPort(),
        profile.mode.startsWith('tun') ? getTunStack() : Promise.resolve(null),
        getUseDHCP(),
        getConfiguredDirectDNS(),
        getConfiguredProxyDNS(),
        getControllerPort(),
        getControllerSecret(),
        getSavedDefaultNode(identifier),
        customRulePromises[0],
        customRulePromises[1],
    ]);

    return JSON.stringify({
        identifier,
        profile,
        subRev,
        templateKey,
        stageVersion,
        allowLan,
        bypassRouter,
        proxyPort,
        tunStack,
        useDHCP,
        directDNS,
        proxyDNS,
        controllerPort,
        controllerSecret,
        defaultNode,
        directRules,
        proxyRules,
    });
}

function applyCustomRuleSet(
    newConfig: any,
    slot: string,
    legacySlot: string,
    ruleSet: CustomRuleSet | null,
) {
    if (!ruleSet) return;
    const rule = newConfig.route.rules.find((item: any) =>
        ruleSlotMatches(item, slot, legacySlot)
    );
    if (!rule) return;
    rule.domain = rule.domain ?? [];
    rule.domain_suffix = rule.domain_suffix ?? [];
    rule.ip_cidr = rule.ip_cidr ?? [];
    rule.domain.push(...ruleSet.domain);
    rule.domain_suffix.push(...ruleSet.domain_suffix);
    rule.ip_cidr.push(...ruleSet.ip_cidr);
}

async function mergeConfig(identifier: string, options: MergeConfigOptions) {
    const isTun = options.mode === 'tun' || options.mode === 'tun-global';
    const customRulePromises = options.customRules
        ? [getCustomRuleSet('direct'), getCustomRuleSet('proxy')] as const
        : [Promise.resolve(null), Promise.resolve(null)] as const;

    const [
        newConfig,
        dbConfigData,
        appConfigPath,
        stageVersion,
        allowLan,
        bypassRouter,
        proxyPort,
        tunStack,
        useDHCP,
        configuredDirectDNS,
        defaultNode,
        directCustomRuleSet,
        proxyCustomRuleSet,
    ] = await Promise.all([
        getConfigTemplate(options.mode),
        getSubscriptionConfig(identifier),
        path.appConfigDir(),
        getStoreValue(STAGE_VERSION_STORE_KEY),
        getAllowLan(),
        isBypassRouterEnabled(),
        getProxyPort(),
        getTunStack(),
        getUseDHCP(),
        getConfiguredDirectDNS(),
        getSavedDefaultNode(identifier),
        customRulePromises[0],
        customRulePromises[1],
    ]);

    newConfig.log.level = stageVersion === "dev" ? "debug" : "info";
    console.log(options.label);

    if (options.customRules) {
        applyCustomRuleSet(newConfig, DIRECT_RULE_SLOT, LEGACY_DIRECT_RULE_SLOT, directCustomRuleSet);
        applyCustomRuleSet(newConfig, PROXY_RULE_SLOT, LEGACY_PROXY_RULE_SLOT, proxyCustomRuleSet);
    }

    const dbCacheFilePath = await path.join(appConfigPath, cacheFileNameForProfile(options.mode));
    await Promise.all([
        patchDnsProxyConfig(newConfig),
        updateExperimentalConfig(newConfig, dbCacheFilePath),
    ]);

    // Resolve local rule_set paths, and force remote rule_sets to download
    // through the direct outbound so they don't compete with proxy setup.
    if (newConfig.route?.rule_set) {
        for (const ruleSet of newConfig.route.rule_set) {
            if (ruleSet.type === "local" && ruleSet.path) {
                ruleSet.path = await path.resolveResource(ruleSet.path);
            }
            if (ruleSet.type === "remote" && !ruleSet.download_detour) {
                ruleSet.download_detour = "direct";
            }
        }
    }

    // TUN mode: configure the TUN inbound (stack, gateway, auto_route, etc.)
    // SystemProxy mode: the template already has no TUN inbound — nothing to remove.
    if (isTun) {
        await configureTunInbound(newConfig, bypassRouter, {
            proxyPort,
            tunStack,
            osType: getOsType(),
            enableAutoRoute: true,
        });
    }

    await configureMixedInbound(newConfig, allowLan, bypassRouter, proxyPort);
    await updateDHCPSettings2Config(newConfig, { useDHCP, configuredDirectDNS });
    await updateVPNServerConfigFromDB('config.json', dbConfigData, newConfig, defaultNode);
}

export function setRuleConfig(identifier: string, tun: boolean) {
    const mode: configType = tun ? 'tun' : 'mixed';
    return mergeConfig(identifier, {
        mode,
        customRules: true,
        label: `写入[规则]${tun ? 'TUN' : '系统代理'}配置文件`,
    });
}

export function setGlobalConfig(identifier: string, tun: boolean) {
    const mode: configType = tun ? 'tun-global' : 'mixed-global';
    return mergeConfig(identifier, {
        mode,
        customRules: false,
        label: `写入[全局]${tun ? 'TUN' : '系统代理'}配置文件`,
    });
}
