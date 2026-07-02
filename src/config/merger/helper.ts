import { type } from '@tauri-apps/plugin-os';
import { getConfiguredDirectDNS, getProxyPort, getTunStack, getUseDHCP } from "../../single/store";
import { TUN_INTERFACE_NAME } from "../../types/definition";
import { writeConfigFile } from "../helper";

type Item = {
    tag: string;
    type: string;
    platform?: any;
    stack?: string;
    interface_name?: string;
    route_exclude_address?: string[];
}

type DnsSettings = {
    useDHCP?: boolean;
    configuredDirectDNS?: string;
}

type TunInboundSettings = {
    proxyPort?: number;
    tunStack?: string;
    osType?: string;
    enableAutoRoute?: boolean;
}

export async function updateDHCPSettings2Config(newConfig: any, settings: DnsSettings = {}) {
    const useDHCP = settings.useDHCP ?? (await getUseDHCP());
    const configuredDirectDNS = useDHCP
        ? undefined
        : settings.configuredDirectDNS ?? (await getConfiguredDirectDNS());
    for (let i = 0; i < newConfig.dns.servers.length; i++) {
        const server = newConfig.dns.servers[i];
        if (server.tag === "system") {
            if (useDHCP) {
                server.type = "dhcp";
                delete server.server;
                delete server.server_port;
                console.log("启用 DHCP DNS 模式");
            } else if (configuredDirectDNS) {
                console.log("当前使用自定义直连 DNS 地址：", configuredDirectDNS);
                server.type = "udp";
                server.server = configuredDirectDNS;
                server.server_port = 53;
                console.log("启用 UDP DNS 模式, 服务器地址：", server.server);
            }
        }
    }
}

/**
 * 只提取 VPN 服务器节点配置合并到配置文件中
 */
export async function updateVPNServerConfigFromDB(fileName: string, dbConfigData: any, newConfig: any) {
    if (!dbConfigData?.outbounds) {
        throw new Error('subscription_config_missing');
    }

    if (!newConfig["outbounds"] || !Array.isArray(newConfig["outbounds"])) {
        throw new Error('remote_template_missing_outbounds_array');
    }

    let outboundsSelectorIndex = newConfig["outbounds"].findIndex((o: any) => o.tag === "ExitGateway" && o.type === "selector");
    let outboundsUrltestIndex = newConfig["outbounds"].findIndex((o: any) => o.tag === "auto" && o.type === "urltest");

    if (outboundsSelectorIndex === -1 || outboundsUrltestIndex === -1) {
        throw new Error('remote_template_missing_routing_groups');
    }

    const outbound_groups = newConfig["outbounds"];
    const outboundsSelector = outbound_groups[outboundsSelectorIndex]["outbounds"];
    const outboundsUrltest = outbound_groups[outboundsUrltestIndex]["outbounds"];

    const seenTags = new Set<string>();
    const vpnServerList = dbConfigData.outbounds.filter((item: Item) => {
        // 只找VPN服务器的节点配置
        let flag = item.type !== "selector" && item.type !== "urltest" && item.type !== "direct" && item.type !== "block";

        // sing-box 1.12 版本开始，dns 类型的节点不再需要
        flag = flag && item.type !== "dns";

        if (flag && seenTags.has(item.tag)) {
            console.warn(`[CONFIG] Skipping duplicate outbound tag: ${item.tag}`);
            return false;
        }
        if (flag) seenTags.add(item.tag);
        return flag;
    });

    for (let i = 0; i < vpnServerList.length; i++) {
        vpnServerList[i]["domain_resolver"] = "system";
        outboundsSelector.push(vpnServerList[i].tag);
    }

    const urltestNameList: string[] = vpnServerList.map((item: any) => item.tag);

    outboundsUrltest.push(...urltestNameList);
    outbound_groups.push(...vpnServerList);

    await writeConfigFile(fileName, new TextEncoder().encode(JSON.stringify(newConfig)));
}

export async function configureTunInbound(
    newConfig: any,
    bypassRouter: boolean = false,
    settings: TunInboundSettings = {}
): Promise<void> {
    const tunInbound = newConfig.inbounds.find((ib: Item) => ib.type === "tun" && ib.tag === "tun");
    if (!tunInbound) return;
    const proxyPort = settings.proxyPort ?? (await getProxyPort());

    if (tunInbound.platform?.http_proxy) {
        tunInbound.platform.http_proxy.server_port = proxyPort;
    }

    const osType = settings.osType ?? type();
    if (osType === "linux") {
        tunInbound.stack = "system";
    } else if (osType !== "macos") {
        // macOS 上保留模板默认的 stack（通常为 gvisor），
        // system stack 在 macOS 上有已知的路由表/IPv6 兼容性问题。
        tunInbound.stack = settings.tunStack ?? (await getTunStack());
    }
    if (osType === "macos") {
        tunInbound.interface_name = TUN_INTERFACE_NAME;
    }

    if (bypassRouter && Array.isArray(tunInbound.route_exclude_address)) {
        const lanRanges = new Set(["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"]);
        tunInbound.route_exclude_address = tunInbound.route_exclude_address.filter(
            (cidr: string) => !lanRanges.has(cidr),
        );
        tunInbound.route_exclude_address.push("10.0.0.1/32");
    }

    if (bypassRouter) {
        const hasDnsIn = newConfig.inbounds.some((ib: Item) => ib.tag === "dns-in");
        if (!hasDnsIn) {
            newConfig.inbounds.push({
                tag: "dns-in",
                type: "direct",
                listen: "::",
                listen_port: 53,
            });
            console.log("旁路由模式：注入 dns-in inbound ([::]:53)");
        }
    }

    // Control whether TUN captures system traffic via auto_route.
    // When false, TUN inbound exists but doesn't set up routes — used for
    // fast mode-switching (config always has both inbounds).
    if (settings.enableAutoRoute !== undefined) {
        tunInbound.auto_route = settings.enableAutoRoute;
    }

    console.log("当前 TUN Stack:", tunInbound.stack, "auto_route:", tunInbound.auto_route);
}

export async function configureMixedInbound(
    newConfig: any,
    allowLan: boolean,
    bypassRouter: boolean = false,
    proxyPort?: number
): Promise<void> {
    const mixedInbound = newConfig.inbounds.find((ib: Item) => ib.type === "mixed" && ib.tag === "mixed");
    if (mixedInbound) {
        mixedInbound.listen = (allowLan || bypassRouter) ? "0.0.0.0" : "127.0.0.1";
        mixedInbound.listen_port = proxyPort ?? (await getProxyPort());
    }
}
