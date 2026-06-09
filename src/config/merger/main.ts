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
      templateStringCache.delete(cacheKey);
      templateObjectCache.delete(cacheKey);
      await setStoreValue(cacheKey, '');
      config = getBuiltInTemplate(mode);
      await setStoreValue(cacheKey, config);
      templateStringCache.set(cacheKey, config);
      parsed = JSON.parse(config);
    }
    templateObjectCache.set(cacheKey, parsed);
    return structuredClone(parsed);
}

async function updateExperimentalConfig(newConfig: any, dbCacheFilePath: string) {
    const [port, secret] = await Promise.all([
        getControllerPort(),
        getControllerSecret(),
    ]);
    newConfig["experimental"] = newConfig["experimental"] || {};
    newConfig["experimental"]["clash_api"] = {
        "external_controller": `127.0.0.1:${port}`,
        "secret": secret,
    };

    newConfig["experimental"]["cache_file"] = {
        "enabled": true,
        "store_fakeip": true,
        "store_rdrc": true,
        "path": dbCacheFilePath
    };
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

export type MergeProfile = {
    mode: configType;
    cacheFileName: string;
    tun: boolean;
    customRules: boolean;
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
        profile.tun ? getTunStack() : Promise.resolve(null),
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
    rule.domain.push(...ruleSet.domain);
    rule.domain_suffix.push(...ruleSet.domain_suffix);
    rule.ip_cidr.push(...ruleSet.ip_cidr);
}

async function mergeConfig(identifier: string, options: MergeConfigOptions) {
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
        options.tun ? getTunStack() : Promise.resolve(undefined),
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

    const dbCacheFilePath = await path.join(appConfigPath, options.cacheFileName);
    await Promise.all([
        patchDnsProxyConfig(newConfig),
        updateExperimentalConfig(newConfig, dbCacheFilePath),
    ]);

    // Resolve local rule_set paths to absolute paths using Tauri's resource resolver
    if (newConfig.route?.rule_set) {
        for (const ruleSet of newConfig.route.rule_set) {
            if (ruleSet.type === "local" && ruleSet.path) {
                ruleSet.path = await path.resolveResource(ruleSet.path);
            }
        }
    }

    if (options.tun) {
        await configureTunInbound(newConfig, bypassRouter, {
            proxyPort,
            tunStack,
            osType: getOsType(),
        });
    }

    await configureMixedInbound(newConfig, allowLan, bypassRouter, proxyPort);
    await updateDHCPSettings2Config(newConfig, { useDHCP, configuredDirectDNS });
    await updateVPNServerConfigFromDB('config.json', dbConfigData, newConfig, defaultNode);
}

export function setMixedConfig(identifier: string) {
    return mergeConfig(identifier, {
        mode: 'mixed',
        cacheFileName: 'mixed-cache-rule-v2.db',
        label: "写入[规则]系统代理配置文件",
        tun: false,
        customRules: true,
    });
}

export function setTunConfig(identifier: string) {
    return mergeConfig(identifier, {
        mode: 'tun',
        cacheFileName: 'tun-cache-rule-v2.db',
        label: "写入[规则]TUN代理配置文件",
        tun: true,
        customRules: true,
    });
}

export function setGlobalMixedConfig(identifier: string) {
    return mergeConfig(identifier, {
        mode: 'mixed-global',
        cacheFileName: 'mixed-cache-global-v2.db',
        label: "写入[全局]系统代理配置文件",
        tun: false,
        customRules: false,
    });
}

export default function setGlobalTunConfig(identifier: string) {
    return mergeConfig(identifier, {
        mode: 'tun-global',
        cacheFileName: 'tun-cache-global-v2.db',
        label: "写入[全局]TUN代理配置文件",
        tun: true,
        customRules: false,
    });
}
