import { getSubscriptionConfig } from '../../action/db';
import {
    getAllowLan,
    getConfiguredDirectDNS,
    getControllerPort,
    getEnableIpv6,
    getProxyPort,
    isBypassRouterEnabled,
} from '../../single/store';
import { configureMixedInbound, updateApiConfig, updateDnsSettings, updateVPNServerConfigFromDB } from './helper';
import { buildBaseXrayConfig } from '../xray-base-template';

import { configType } from '../common';

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

function isTunMode(mode: configType): boolean {
    return mode === 'tun' || mode === 'tun-global';
}

async function mergeConfig(identifier: string, options: MergeConfigOptions) {
    const isTun = isTunMode(options.mode);
    const isGlobal = options.mode === 'mixed-global' || options.mode === 'tun-global';

    const [
        dbConfigData,
        allowLan,
        bypassRouter,
        proxyPort,
        apiPort,
        configuredDirectDNS,
        enableIpv6,
    ] = await Promise.all([
        getSubscriptionConfig(identifier),
        getAllowLan(),
        isBypassRouterEnabled(),
        getProxyPort(),
        getControllerPort(),
        getConfiguredDirectDNS(),
        getEnableIpv6(),
    ]);

    if (!dbConfigData || !Array.isArray(dbConfigData.outbounds) || dbConfigData.outbounds.length === 0) {
        throw new Error(`Subscription config unavailable for identifier=${identifier}`);
    }

    console.log(options.label);

    const newConfig = buildBaseXrayConfig(isGlobal, isTun, bypassRouter, enableIpv6);

    updateApiConfig(newConfig, apiPort);
    await configureMixedInbound(newConfig, allowLan, bypassRouter, proxyPort);
    updateDnsSettings(newConfig, configuredDirectDNS, enableIpv6);
    await updateVPNServerConfigFromDB('config.json', dbConfigData, newConfig);
}

export function setRuleConfig(identifier: string, tun: boolean) {
    return mergeConfig(identifier, {
        mode: tun ? 'tun' : 'mixed',
        label: `写入[规则]${tun ? 'TUN' : '系统代理'}配置文件`,
    });
}

export function setGlobalConfig(identifier: string, tun: boolean) {
    return mergeConfig(identifier, {
        mode: tun ? 'tun-global' : 'mixed-global',
        label: `写入[全局]${tun ? 'TUN' : '系统代理'}配置文件`,
    });
}
