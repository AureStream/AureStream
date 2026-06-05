import * as path from '@tauri-apps/api/path';
import { getSubscriptionConfig } from '../../action/db';
import { getAllowLan, getControllerSecret, getControllerPort, getCustomRuleSet, getStoreValue, isBypassRouterEnabled, setStoreValue } from '../../single/store';
import { DIRECT_RULE_SLOT, LEGACY_DIRECT_RULE_SLOT, LEGACY_PROXY_RULE_SLOT, PROXY_RULE_SLOT, ruleSlotMatches } from '../rule-tags';
import { STAGE_VERSION_STORE_KEY, selectedNodeTagStoreKey, LEGACY_SELECTED_NODE_TAG_KEY } from '../../types/definition';
import { configureMixedInbound, configureTunInbound, updateDHCPSettings2Config, updateVPNServerConfigFromDB, patchDnsProxyConfig, excludeFakeIpFromPrivateRules } from './helper';

import { configType, getConfigTemplateCacheKey } from '../common';
import { getBuiltInTemplate } from '../templates';

async function getConfigTemplate(mode: configType): Promise<any> {
    const cacheKey = await getConfigTemplateCacheKey(mode);
    let config = await getStoreValue(cacheKey, '');
    if (!config) {
        config = getBuiltInTemplate(mode);
        await setStoreValue(cacheKey, config);
        console.info(`[template] cache empty for mode=${mode}, seeded built-in snapshot`);
    }
    return JSON.parse(config);
}

async function updateExperimentalConfig(newConfig: any, dbCacheFilePath: string) {
    const port = await getControllerPort();
    newConfig["experimental"] = newConfig["experimental"] || {};
    newConfig["experimental"]["clash_api"] = {
        "external_controller": `127.0.0.1:${port}`,
        "secret": await getControllerSecret(),
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
    let saved = await getStoreValue(key, '') as string;
    if (!saved) {
        const legacy = await getStoreValue(LEGACY_SELECTED_NODE_TAG_KEY, '') as string;
        if (legacy) {
            saved = legacy;
        }
    }
    return saved;
}

export async function setMixedConfig(identifier: string) {
    const newConfig = await getConfigTemplate('mixed');
    let level = await getStoreValue(STAGE_VERSION_STORE_KEY) === "dev" ? "debug" : "info";
    newConfig.log.level = level;
    await patchDnsProxyConfig(newConfig);
    excludeFakeIpFromPrivateRules(newConfig);

    console.log("写入[规则]系统代理配置文件");
    let dbConfigData = await getSubscriptionConfig(identifier);
    const appConfigPath = await path.appConfigDir();
    const dbCacheFilePath = await path.join(appConfigPath, 'mixed-cache-rule-v2.db');

    let directCustomRuleSet = await getCustomRuleSet('direct');
    let proxyCustomRuleSet = await getCustomRuleSet('proxy');

    if (directCustomRuleSet) {
        for (let i = 0; i < newConfig.route.rules.length; i++) {
            let rule = newConfig.route.rules[i];
            if (ruleSlotMatches(rule, DIRECT_RULE_SLOT, LEGACY_DIRECT_RULE_SLOT)) {
                rule.domain.push(...directCustomRuleSet.domain);
                rule.domain_suffix.push(...directCustomRuleSet.domain_suffix);
                rule.ip_cidr.push(...directCustomRuleSet.ip_cidr);
                break;
            }
        }
    }

    if (proxyCustomRuleSet) {
        for (let i = 0; i < newConfig.route.rules.length; i++) {
            let rule = newConfig.route.rules[i];
            if (ruleSlotMatches(rule, PROXY_RULE_SLOT, LEGACY_PROXY_RULE_SLOT)) {
                rule.domain.push(...proxyCustomRuleSet.domain);
                rule.domain_suffix.push(...proxyCustomRuleSet.domain_suffix);
                rule.ip_cidr.push(...proxyCustomRuleSet.ip_cidr);
                break;
            }
        }
    }

    await updateExperimentalConfig(newConfig, dbCacheFilePath);
    const allowLan = await getAllowLan();
    const bypassRouter = await isBypassRouterEnabled();
    await configureMixedInbound(newConfig, allowLan, bypassRouter);

    await updateDHCPSettings2Config(newConfig);
    const defaultNode = await getSavedDefaultNode(identifier);
    await updateVPNServerConfigFromDB('config.json', dbConfigData, newConfig, defaultNode);
}

export async function setTunConfig(identifier: string) {
    const newConfig = await getConfigTemplate('tun');
    let level = await getStoreValue(STAGE_VERSION_STORE_KEY) === "dev" ? "debug" : "info";
    newConfig.log.level = level;
    await patchDnsProxyConfig(newConfig);
    excludeFakeIpFromPrivateRules(newConfig);
    console.log("写入[规则]TUN代理配置文件");
    let dbConfigData = await getSubscriptionConfig(identifier);
    const appConfigPath = await path.appConfigDir();
    const dbCacheFilePath = await path.join(appConfigPath, 'tun-cache-rule-v2.db');
    let directCustomRuleSet = await getCustomRuleSet('direct');
    let proxyCustomRuleSet = await getCustomRuleSet('proxy');

    if (directCustomRuleSet) {
        for (let i = 0; i < newConfig.route.rules.length; i++) {
            let rule = newConfig.route.rules[i];
            if (ruleSlotMatches(rule, DIRECT_RULE_SLOT, LEGACY_DIRECT_RULE_SLOT)) {
                rule.domain.push(...directCustomRuleSet.domain);
                rule.domain_suffix.push(...directCustomRuleSet.domain_suffix);
                rule.ip_cidr.push(...directCustomRuleSet.ip_cidr);
                break;
            }
        }
    }

    if (proxyCustomRuleSet) {
        for (let i = 0; i < newConfig.route.rules.length; i++) {
            let rule = newConfig.route.rules[i];
            if (ruleSlotMatches(rule, PROXY_RULE_SLOT, LEGACY_PROXY_RULE_SLOT)) {
                rule.domain.push(...proxyCustomRuleSet.domain);
                rule.domain_suffix.push(...proxyCustomRuleSet.domain_suffix);
                rule.ip_cidr.push(...proxyCustomRuleSet.ip_cidr);
                break;
            }
        }
    }

    const bypassRouter = await isBypassRouterEnabled();
    await configureTunInbound(newConfig, bypassRouter);

    await updateExperimentalConfig(newConfig, dbCacheFilePath);
    const allowLan = await getAllowLan();
    await configureMixedInbound(newConfig, allowLan, bypassRouter);

    await updateDHCPSettings2Config(newConfig);
    const defaultNode = await getSavedDefaultNode(identifier);
    await updateVPNServerConfigFromDB('config.json', dbConfigData, newConfig, defaultNode);
}

export async function setGlobalMixedConfig(identifier: string) {
    const newConfig = await getConfigTemplate('mixed-global');
    let level = await getStoreValue(STAGE_VERSION_STORE_KEY) === "dev" ? "debug" : "info";
    newConfig.log.level = level;
    await patchDnsProxyConfig(newConfig);
    excludeFakeIpFromPrivateRules(newConfig);

    console.log("写入[全局]系统代理配置文件");
    let dbConfigData = await getSubscriptionConfig(identifier);
    const appConfigPath = await path.appConfigDir();
    const dbCacheFilePath = await path.join(appConfigPath, 'mixed-cache-global-v2.db');

    await updateExperimentalConfig(newConfig, dbCacheFilePath);
    const allowLan = await getAllowLan();
    const bypassRouter = await isBypassRouterEnabled();
    await configureMixedInbound(newConfig, allowLan, bypassRouter);

    await updateDHCPSettings2Config(newConfig);
    const defaultNode = await getSavedDefaultNode(identifier);
    await updateVPNServerConfigFromDB('config.json', dbConfigData, newConfig, defaultNode);
}

export default async function setGlobalTunConfig(identifier: string) {
    const newConfig = await getConfigTemplate('tun-global');
    let level = await getStoreValue(STAGE_VERSION_STORE_KEY) === "dev" ? "debug" : "info";
    newConfig.log.level = level;
    await patchDnsProxyConfig(newConfig);
    excludeFakeIpFromPrivateRules(newConfig);

    console.log("写入[全局]TUN代理配置文件");
    let dbConfigData = await getSubscriptionConfig(identifier);
    const appConfigPath = await path.appConfigDir();
    const dbCacheFilePath = await path.join(appConfigPath, 'tun-cache-global-v2.db');

    const bypassRouter = await isBypassRouterEnabled();
    await configureTunInbound(newConfig, bypassRouter);

    await updateExperimentalConfig(newConfig, dbCacheFilePath);

    const allowLan = await getAllowLan();
    await configureMixedInbound(newConfig, allowLan, bypassRouter);

    await updateDHCPSettings2Config(newConfig);
    const defaultNode = await getSavedDefaultNode(identifier);
    await updateVPNServerConfigFromDB('config.json', dbConfigData, newConfig, defaultNode);
}
