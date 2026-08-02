import { getSubscriptionConfig } from '../../action/db';
import {
    getAllowLan,
    getConfiguredDirectDNS,
    getControllerPort,
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

/**
 * Convenience: build MergeProfile from routing mode + TUN boolean.
 *
 * TUN mode is deferred — Xray-core's native `tun` inbound isn't wired up on
 * the Rust engine side yet (System Proxy mode only, this phase).
 */
export function makeProfile(routing: RoutingMode, tun: boolean): MergeProfile {
    if (tun) {
        throw new Error('TUN mode is not yet supported on the Xray-core engine (deferred to a later phase)');
    }
    return { mode: routing === 'global' ? 'mixed-global' : 'mixed' };
}

type MergeConfigOptions = MergeProfile & {
    label: string;
}

function isTunMode(mode: configType): boolean {
    return mode === 'tun' || mode === 'tun-global';
}

async function mergeConfig(identifier: string, options: MergeConfigOptions) {
    if (isTunMode(options.mode)) {
        throw new Error('TUN mode is not yet supported on the Xray-core engine (deferred to a later phase)');
    }
    const isGlobal = options.mode === 'mixed-global';

    const [
        dbConfigData,
        allowLan,
        bypassRouter,
        proxyPort,
        apiPort,
        configuredDirectDNS,
    ] = await Promise.all([
        getSubscriptionConfig(identifier),
        getAllowLan(),
        isBypassRouterEnabled(),
        getProxyPort(),
        getControllerPort(),
        getConfiguredDirectDNS(),
    ]);

    if (!dbConfigData || !Array.isArray(dbConfigData.outbounds) || dbConfigData.outbounds.length === 0) {
        throw new Error(`Subscription config unavailable for identifier=${identifier}`);
    }

    console.log(options.label);

    const newConfig = buildBaseXrayConfig(isGlobal);

    updateApiConfig(newConfig, apiPort);
    await configureMixedInbound(newConfig, allowLan, bypassRouter, proxyPort);
    updateDnsSettings(newConfig, configuredDirectDNS);
    await updateVPNServerConfigFromDB('config.json', dbConfigData, newConfig);
}

export async function setRuleConfig(identifier: string, tun: boolean) {
    if (tun) {
        throw new Error('TUN mode is not yet supported on the Xray-core engine (deferred to a later phase)');
    }
    return mergeConfig(identifier, {
        mode: 'mixed',
        label: `写入[规则]系统代理配置文件`,
    });
}

export async function setGlobalConfig(identifier: string, tun: boolean) {
    if (tun) {
        throw new Error('TUN mode is not yet supported on the Xray-core engine (deferred to a later phase)');
    }
    return mergeConfig(identifier, {
        mode: 'mixed-global',
        label: `写入[全局]系统代理配置文件`,
    });
}
