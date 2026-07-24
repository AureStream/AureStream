import * as path from '@tauri-apps/api/path';
import { type as getOsType } from '@tauri-apps/plugin-os';
import { getSubscriptionConfig } from '../../action/db';
import {
    getAllowLan,
    getConfiguredDirectDNS,
    getControllerSecret,
    getControllerPort,
    getProxyPort,
    getStoreValue,
    getTunStack,
    getUseDHCP,
    isBypassRouterEnabled,
} from '../../single/store';
import { STAGE_VERSION_STORE_KEY } from '../../types/definition';
import { configureMixedInbound, configureTunInbound, updateDHCPSettings2Config, updateVPNServerConfigFromDB } from './helper';

import { configType } from '../common';
import { cacheFileNameForProfile } from '../rule-cache';
import { fetchRemoteTemplate } from '../templates/fetch';

async function getConfigTemplate(mode: configType): Promise<any> {
    const configString = await fetchRemoteTemplate(mode);
    return JSON.parse(configString);
}


async function updateExperimentalConfig(newConfig: any, dbCacheFilePath: string) {
    newConfig.experimental = newConfig.experimental ?? {};
    newConfig.experimental.clash_api = newConfig.experimental.clash_api ?? {};

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

/** Routing mode dimension (without proxy mode). */
export type RoutingMode = 'rule' | 'global';

/** Merge profile: encodes both routing mode and proxy mode. */
export type MergeProfile = {
    mode: configType;
}

/** Convenience: build MergeProfile from routing mode + TUN boolean. */
export function makeProfile(routing: RoutingMode, tun: boolean): MergeProfile {
    if (routing === 'global') {
        return { mode: tun ? 'tun-global' : 'mixed-global' };
    }
    return { mode: tun ? 'tun' : 'mixed' };
}

type MergeConfigOptions = MergeProfile & {
    label: string;
}

async function mergeConfig(identifier: string, options: MergeConfigOptions) {
    const isTun = options.mode === 'tun' || options.mode === 'tun-global';

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
    ]);

    if (!dbConfigData || !Array.isArray(dbConfigData.outbounds) || dbConfigData.outbounds.length === 0) {
        throw new Error(`Subscription config unavailable for identifier=${identifier}`);
    }

    newConfig.log.level = stageVersion === "dev" ? "debug" : "info";
    console.log(options.label);

    const dbCacheFilePath = await path.join(appConfigPath, cacheFileNameForProfile(options.mode));
    await Promise.all([

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
    await updateVPNServerConfigFromDB('config.json', dbConfigData, newConfig);
}

export function setRuleConfig(identifier: string, tun: boolean) {
    const mode: configType = tun ? 'tun' : 'mixed';
    return mergeConfig(identifier, {
        mode,
        label: `写入[规则]${tun ? 'TUN' : '系统代理'}配置文件`,
    });
}

export function setGlobalConfig(identifier: string, tun: boolean) {
    const mode: configType = tun ? 'tun-global' : 'mixed-global';
    return mergeConfig(identifier, {
        mode,
        label: `写入[全局]${tun ? 'TUN' : '系统代理'}配置文件`,
    });
}
