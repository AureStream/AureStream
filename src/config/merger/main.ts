import * as path from '@tauri-apps/api/path';
import { type as getOsType } from '@tauri-apps/plugin-os';
import { getSubscriptionConfig } from '../../action/db';
import {
    getAllowLan,
    getConfiguredDirectDNS,
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

async function getConfigTemplate(mode: configType): Promise<any> {
    const cacheKey = await getConfigTemplateCacheKey(mode);
    let config = templateStringCache.get(cacheKey);
    if (config) {
        return JSON.parse(config);
    }

    config = await getStoreValue(cacheKey, '');
    if (!config) {
        config = getBuiltInTemplate(mode);
        await setStoreValue(cacheKey, config);
        console.info(`[template] cache empty for mode=${mode}, seeded built-in snapshot`);
    }
    templateStringCache.set(cacheKey, config);
    return JSON.parse(config);
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

type MergeConfigOptions = {
    mode: configType;
    cacheFileName: string;
    label: string;
    tun: boolean;
    customRules: boolean;
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
