import { getProxyPort } from "../../single/store";
import { writeConfigFile } from "../helper";
import type { FragmentSpec, XrayOutbound } from "../subscription-decoder";
import { DNS_DIRECT_TAG, PROXY_BALANCER_TAG } from "../xray-base-template";

function fragmentKey(f: FragmentSpec): string {
    return `${f.packets}|${f.length}|${f.interval}`;
}

/**
 * Inject subscription outbounds into the base config: dedupes identical
 * `_fragment` tuples into shared `freedom` outbounds (wired in via
 * `streamSettings.sockopt.dialerProxy`), builds the proxy balancer from every
 * node tag, and appends the catch-all routing rule that sends non-direct
 * traffic to it.
 */
export async function updateVPNServerConfigFromDB(fileName: string, dbConfigData: any, newConfig: any) {
    if (!dbConfigData?.outbounds) {
        throw new Error('subscription_config_missing');
    }
    if (!Array.isArray(newConfig.outbounds)) {
        throw new Error('base_template_missing_outbounds_array');
    }
    if (!newConfig.routing || !Array.isArray(newConfig.routing.rules)) {
        throw new Error('base_template_missing_routing');
    }

    const nodeOutbounds: XrayOutbound[] = dbConfigData.outbounds;
    if (nodeOutbounds.length === 0) {
        throw new Error('subscription_config_empty');
    }

    const fragmentTagByKey = new Map<string, string>();
    const fragmentOutbounds: Record<string, unknown>[] = [];
    const nodeTags: string[] = [];

    for (const node of nodeOutbounds) {
        const { _fragment, ...clean } = node;

        if (_fragment) {
            const key = fragmentKey(_fragment);
            let tag = fragmentTagByKey.get(key);
            if (!tag) {
                tag = `fragment-out-${fragmentTagByKey.size + 1}`;
                fragmentTagByKey.set(key, tag);
                fragmentOutbounds.push({
                    tag,
                    protocol: "freedom",
                    settings: { fragment: _fragment },
                });
            }
            const existingStream = (clean.streamSettings as Record<string, unknown> | undefined) ?? {};
            const existingSockopt = (existingStream.sockopt as Record<string, unknown> | undefined) ?? {};
            clean.streamSettings = {
                ...existingStream,
                sockopt: { ...existingSockopt, dialerProxy: tag },
            };
        }

        newConfig.outbounds.push(clean);
        nodeTags.push(clean.tag);
    }

    newConfig.outbounds.push(...fragmentOutbounds);

    newConfig.routing.balancers = [
        {
            tag: PROXY_BALANCER_TAG,
            selector: nodeTags,
            strategy: { type: "random" },
        },
    ];
    newConfig.routing.rules.push({
        type: "field",
        network: "tcp,udp",
        balancerTag: PROXY_BALANCER_TAG,
    });

    await writeConfigFile(fileName, new TextEncoder().encode(JSON.stringify(newConfig)));
}

export async function configureMixedInbound(
    newConfig: any,
    allowLan: boolean,
    bypassRouter: boolean = false,
    proxyPort?: number
): Promise<void> {
    const socksInbound = newConfig.inbounds.find((ib: any) => ib.tag === "mixed-in");
    if (socksInbound) {
        socksInbound.listen = (allowLan || bypassRouter) ? "0.0.0.0" : "127.0.0.1";
        socksInbound.port = proxyPort ?? (await getProxyPort());
    }
}

export function updateApiConfig(newConfig: any, apiPort: number): void {
    if (newConfig.api) {
        newConfig.api.listen = `127.0.0.1:${apiPort}`;
    }
}

/**
 * Patch DNS family preference and optional user direct DNS.
 *
 * Does **not** replace the full server chain (rule mode uses XTLS example-1
 * multi-server fallback). A configured direct DNS only rewrites `address` on
 * entries tagged `dns-direct`. `enableIpv6` controls queryStrategy and the
 * freedom direct outbound's domainStrategy.
 */
export function updateDnsSettings(
    newConfig: any,
    configuredDirectDNS?: string,
    enableIpv6: boolean = false,
): void {
    if (!newConfig.dns) {
        newConfig.dns = {};
    }
    newConfig.dns.queryStrategy = enableIpv6 ? "UseIP" : "UseIPv4";

    if (configuredDirectDNS && Array.isArray(newConfig.dns.servers)) {
        const address = configuredDirectDNS.trim();
        if (address) {
            newConfig.dns.servers = newConfig.dns.servers.map((server: unknown) => {
                if (server && typeof server === "object" && (server as { tag?: string }).tag === DNS_DIRECT_TAG) {
                    return { ...(server as object), address };
                }
                return server;
            });
        }
    }

    const direct = Array.isArray(newConfig.outbounds)
        ? newConfig.outbounds.find((o: any) => o?.tag === "direct" && o?.protocol === "freedom")
        : undefined;
    if (direct) {
        direct.settings = {
            ...(direct.settings ?? {}),
            domainStrategy: enableIpv6 ? "UseIP" : "UseIPv4",
        };
    }
}
